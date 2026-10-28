import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises"
import { createConnection } from "node:net"
import { join } from "node:path"
import { makeConnection, type WireConnection, type Reply } from "../src/Connection.js"

// De-risk probe for the proposed observed-inventory capability: a baseline query
// paired to a subscription by the query's own clock, with epoch-bound
// rebaseline. Nothing here adds public API; it drives the real private daemon
// through the attachment sequence the proposals specify, using the library's
// own Connection. See OBSERVED-PROBE.md at the repository root for findings.

const binary = process.env.WATCHMAN_TEST_BINARY
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const until = async (predicate: () => boolean, label: string, budget = 6000) => {
  for (let attempt = 0; attempt < budget / 30; attempt++) {
    if (predicate()) return
    await pause(30)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

interface Daemon {
  readonly socketPath: string
  readonly kill: () => Promise<void>
}

const startDaemon = async (scratch: string): Promise<Daemon> => {
  const socketPath = join(scratch, "daemon.sock")
  // Stale socket/pid files survive a killed predecessor; a replacement instance
  // must not inherit them.
  await Promise.all([rm(socketPath, { force: true }), rm(join(scratch, "state"), { force: true }), rm(join(scratch, "pid"), { force: true })])
  await writeFile(join(scratch, "global.json"), "{}")
  const daemon = spawn(binary ?? "", ["--foreground", "--no-save-state", "--no-site-spawner",
    `--unix-listener-path=${socketPath}`, `--statefile=${scratch}/state`, `--pidfile=${scratch}/pid`, `--logfile=${scratch}/log`], {
    env: { ...process.env, WATCHMAN_CONFIG_FILE: join(scratch, "global.json"), WATCHMAN_SOCK: "" }, stdio: "ignore"
  })
  const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()))
  const deadline = Date.now() + 5000
  // Socket-file existence is not readiness: probe for a real accepted connection.
  for (;;) {
    const reached = await new Promise<boolean>((resolve) => {
      const probe = createConnection({ path: socketPath })
      probe.once("connect", () => { probe.destroy(); resolve(true) })
      probe.once("error", () => resolve(false))
    })
    if (reached) break
    if (Date.now() > deadline) throw new Error("Private daemon failed to listen")
    await pause(20)
  }
  return {
    socketPath,
    kill: async () => {
      daemon.kill("SIGTERM")
      await Promise.race([exited, pause(1000)])
      if (daemon.exitCode === null) { daemon.kill("SIGKILL"); await exited }
    }
  }
}

describe.each(["json", "bser"] as const)("%s direct observed daemon", (wireFormat) => {
let subscriptionSerial = 0

const connect = async (socketPath: string) => {
  const connection = makeConnection({ socketPath, ...(wireFormat === "bser" ? { wireFormat } : {}), requestTimeoutMs: 10_000, maxFrameBytes: 8 * 1024 * 1024 })
  await connection.connect(new AbortController().signal)
  return connection
}

const watchRoot = (connection: WireConnection, root: string) =>
  connection.command(["watch", root], "watch", root, new AbortController().signal, 10_000)

interface Baseline {
  readonly clock: string
  readonly names: ReadonlyArray<string>
  readonly fresh: boolean
}

/** The proposed step 2: one lexical baseline query retaining its own clock. */
const baseline = async (connection: WireConnection, root: string): Promise<Baseline> => {
  const reply = await connection.query(["query", root, {
    expression: ["allof", ["exists"]], fields: ["name", "type"], sync_timeout: 10_000
  }], new AbortController().signal, 20_000, 32 * 1024 * 1024)
  const names = [...new Set(reply.files.map((file) => typeof file === "string" ? file : file.name))].sort()
  return { clock: reply.clock, names, fresh: reply.is_fresh_instance === true }
}

type ProbeRow = NonNullable<Reply["files"]>[number]

interface ProbeFrame {
  readonly seq: number
  readonly clock: string | undefined
  readonly rows: ReadonlyArray<ProbeRow>
  readonly fresh: boolean
  /** Arrived before the subscribe acknowledgement settled, mirroring SignalBackend staging. */
  readonly staged: boolean
}

interface Pairing {
  readonly name: string
  readonly since: string
  readonly frames: ReadonlyArray<ProbeFrame>
  readonly invalid: () => boolean
  readonly invalidReason: () => string | undefined
  readonly rowNames: () => Set<string>
  readonly waitFor: (predicate: (frame: ProbeFrame) => boolean, label: string, budget?: number) => Promise<ProbeFrame>
  readonly saw: (predicate: (frame: ProbeFrame) => boolean, budgetMs: number) => Promise<boolean>
  readonly detach: () => Promise<void>
}

/** Proposed steps 3-5: listener before subscribe, staging until acknowledgement, fresh history rejects the pairing. */
const pair = async (connection: WireConnection, root: string, since: string, options: { expression?: ReadonlyArray<unknown> } = {}): Promise<Pairing> => {
  const name = `observed-probe-${++subscriptionSerial}`
  const frames: Array<ProbeFrame> = []
  let reason: string | undefined
  let acknowledged = false
  connection.listeners.set(name, {
    push: (reply) => {
      if (reply.error) { reason ??= reply.error; return }
      if (reply.is_fresh_instance) reason ??= "is_fresh_instance"
      frames.push({
        seq: frames.length, clock: reply.clock, rows: reply.files ?? [],
        fresh: reply.is_fresh_instance === true, staged: !acknowledged
      })
    },
    fail: (error) => { reason ??= error.message }
  })
  try {
    await connection.command(["subscribe", root, name, {
      since, fields: ["name", "exists", "new"], ...(options.expression ? { expression: options.expression } : {})
    }], "subscribe", name, new AbortController().signal, 10_000)
  } catch (error) {
    connection.listeners.delete(name)
    throw error
  }
  acknowledged = true
  return {
    name, since, frames,
    invalid: () => reason !== undefined,
    invalidReason: () => reason,
    rowNames: () => new Set(frames.flatMap((frame) => frame.rows.map((row) => row.name))),
    waitFor: async (predicate, label, budget = 8000) => {
      for (let attempt = 0; attempt < budget / 30; attempt++) {
        const found = frames.find(predicate)
        if (found) return found
        await pause(30)
      }
      throw new Error(`Timed out waiting for ${label} on ${name}`)
    },
    saw: async (predicate, budgetMs) => {
      await pause(budgetMs)
      return frames.some(predicate)
    },
    detach: async () => {
      connection.listeners.delete(name)
      await connection.command(["unsubscribe", root, name], "unsubscribe", name, new AbortController().signal, 500, 2000).catch(() => {})
    }
  }
}

/** Change rows tagged with the subscription identity and epoch that produced them. */
interface TaggedChange {
  readonly epoch: number
  readonly subscription: string
  readonly name: string
  readonly exists: boolean
}

/** The guard: apply only work belonging to the current epoch. */
const projectTagged = (baselineNames: ReadonlyArray<string>, changes: ReadonlyArray<TaggedChange>, epoch: number) => {
  const present = new Set(baselineNames)
  for (const change of changes) {
    if (change.epoch !== epoch) continue
    if (change.exists) present.add(change.name)
    else present.delete(change.name)
  }
  return present
}

/** The failure mode: replay every queued old change against the new baseline. */
const projectNaive = (baselineNames: ReadonlyArray<string>, changes: ReadonlyArray<TaggedChange>) => {
  const present = new Set(baselineNames)
  for (const change of changes) {
    if (change.exists) present.add(change.name)
    else present.delete(change.name)
  }
  return present
}

const diskNames = async (root: string) => {
  const names = new Set<string>()
  const walk = async (directory: string, prefix: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".watchman-cookie-")) continue
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      names.add(name)
      if (entry.isDirectory()) await walk(join(directory, entry.name), name)
    }
  }
  await walk(root, "")
  return names
}

test("epoch-tagged guard drops superseded subscription work without a daemon", () => {
  const baselineNames = ["a.ts", "stable.ts"]
  const queued: ReadonlyArray<TaggedChange> = [
    { epoch: 1, subscription: "old-subscription", name: "a.ts", exists: false },
    { epoch: 1, subscription: "old-subscription", name: "late.ts", exists: true }
  ]
  expect(projectNaive(baselineNames, queued).has("a.ts")).toBe(false)
  const guarded = projectTagged(baselineNames, queued, 2)
  expect(guarded.has("a.ts")).toBe(true)
  expect(guarded.has("late.ts")).toBe(false)
  expect([...projectTagged(baselineNames, queued, 1)].sort()).toEqual(["late.ts", "stable.ts"])
})

test.skipIf(!binary)("private daemon: query clock pairs a baseline subscription with staged pre-ack delivery", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-pair-"))
  const root = join(scratch, "root")
  await mkdir(join(root, "nested"), { recursive: true })
  // Fixture-owned coverage: do not let daemon VCS defaults mask rows.
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "keep.ts"), "kept")
  await writeFile(join(root, "pre-existing.ts"), "recently written before the query")
  await writeFile(join(root, "raced-delete.ts"), "deleted between query and subscribe")
  await writeFile(join(root, "recreated.ts"), "recreated between query and subscribe")
  await writeFile(join(root, "nested", "deep.ts"), "nested")
  const daemon = await startDaemon(scratch)
  try {
    const connection = await connect(daemon.socketPath)
    await watchRoot(connection, root)
    const q1 = await baseline(connection, root)
    expect(q1.names).toEqual([".watchmanconfig", "keep.ts", "nested", "nested/deep.ts", "pre-existing.ts", "raced-delete.ts", "recreated.ts"])
    // A plain non-since query always reports is_fresh_instance per the query docs;
    // that flag cannot judge pairing validity and must never be read off a baseline.
    expect(q1.fresh).toBe(true)
    // Racing changes inside the query→subscribe window.
    await unlink(join(root, "raced-delete.ts"))
    await writeFile(join(root, "raced-create.ts"), "created between query and subscribe")
    await unlink(join(root, "recreated.ts"))
    await writeFile(join(root, "recreated.ts"), "recreated")
    const pairing = await pair(connection, root, q1.clock)
    try {
      await pairing.waitFor((frame) => frame.rows.some((row) => row.name === "raced-delete.ts" && !row.exists), "raced-delete removal")
      await pairing.waitFor((frame) => frame.rows.some((row) => row.name === "raced-create.ts" && row.exists), "raced-create catch-up")
      await pairing.waitFor((frame) => frame.rows.some((row) => row.name === "recreated.ts" && row.exists), "recreated catch-up")
      await writeFile(join(root, "after-ack.ts"), "after ack")
      await pairing.waitFor((frame) => frame.rows.some((row) => row.name === "after-ack.ts" && row.exists), "after-ack create")
      await unlink(join(root, "after-ack.ts"))
      await pairing.waitFor((frame) => frame.rows.some((row) => row.name === "after-ack.ts" && !row.exists), "after-ack removal")
      // Exactly the post-query mutations surface on the subscription side; no
      // baseline-only path is duplicated and no post-boundary path is missing.
      expect(pairing.rowNames()).toEqual(new Set(["after-ack.ts", "raced-create.ts", "raced-delete.ts", "recreated.ts"]))
      expect(pairing.invalid()).toBe(false)
      const staged = pairing.frames.filter((frame) => frame.staged)
      // Staged frames keep arrival order and precede every acknowledged frame.
      expect(staged.map((frame) => frame.seq)).toEqual(staged.map((_, index) => index))
      // Observed state projects to the settled disk state.
      const present = new Set(q1.names)
      for (const frame of pairing.frames) {
        for (const row of frame.rows) row.exists ? present.add(row.name) : present.delete(row.name)
      }
      await pause(300)
      expect([...present].sort()).toEqual([...await diskNames(root)].sort())
      const now = await connection.command(["clock", root], "clock", undefined, new AbortController().signal, 10_000)
      expect(q1.clock.startsWith("c:")).toBe(true)
      expect(now.clock?.startsWith("c:")).toBe(true)
      console.log(`[observed-probe] pairing frames=${pairing.frames.length} staged=${staged.length} queryClock=${q1.clock} clockCommand=${now.clock} recreatedRows=${JSON.stringify(pairing.frames.flatMap((frame) => frame.rows.filter((row) => row.name === "recreated.ts")))}`)
    } finally {
      await pairing.detach()
    }
    connection.close()
  } finally {
    await daemon.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 20_000)

test.skipIf(!binary)("private daemon: inheriting the baseline exists expression suppresses deletions", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-exists-"))
  const root = join(scratch, "root")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "victim.ts"), "deleted before subscribe")
  const daemon = await startDaemon(scratch)
  try {
    const connection = await connect(daemon.socketPath)
    await watchRoot(connection, root)
    const q = await baseline(connection, root)
    expect(q.names).toContain("victim.ts")
    await unlink(join(root, "victim.ts"))
    await writeFile(join(root, "raced-alive.ts"), "created before subscribe")
    const hazard = await pair(connection, root, q.clock, { expression: ["exists"] })
    const control = await pair(connection, root, q.clock)
    try {
      await control.waitFor((frame) => frame.rows.some((row) => row.name === "victim.ts" && !row.exists), "control removal")
      await hazard.waitFor((frame) => frame.rows.some((row) => row.name === "raced-alive.ts" && row.exists), "hazard liveness")
      // The control subscription observed the deletion; the expression-filtered
      // one never delivers any exists:false row, including that deletion.
      expect(hazard.frames.every((frame) => frame.rows.every((row) => row.exists))).toBe(true)
      expect(await hazard.saw((frame) => frame.rows.some((row) => row.name === "victim.ts" && !row.exists), 800)).toBe(false)
      expect(control.rowNames()).toEqual(new Set(["raced-alive.ts", "victim.ts"]))
    } finally {
      await hazard.detach()
      await control.detach()
    }
    connection.close()
  } finally {
    await daemon.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 20_000)

test.skipIf(!binary)("private daemon: fresh-instance history rejects a fabricated since clock", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-fresh-"))
  const root = join(scratch, "root")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "a.ts"), "present")
  const daemon = await startDaemon(scratch)
  try {
    const connection = await connect(daemon.socketPath)
    await watchRoot(connection, root)
    await baseline(connection, root)
    // A syntactically valid clock from no real instance: older than this daemon's history.
    const fabricated = "c:0:0:0:1"
    const pairing = await pair(connection, root, fabricated)
    try {
      await until(() => pairing.invalid(), "fresh-instance rejection", 8000)
      expect(pairing.invalid()).toBe(true)
      const fresh = pairing.frames.find((frame) => frame.fresh)
      console.log(`[observed-probe] fabricated-clock invalidReason=${pairing.invalidReason()} freshFrameRows=${JSON.stringify(fresh?.rows ?? [])}`)
    } finally {
      await pairing.detach()
    }
    connection.close()
  } finally {
    await daemon.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 20_000)

test.skipIf(!binary)("private daemon: daemon restart invalidates a prior-instance query clock", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-restart-"))
  const root = join(scratch, "root")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "a.ts"), "survives restart")
  const first = await startDaemon(scratch)
  const socketPath = first.socketPath
  let staleClock: string
  try {
    const connection = await connect(socketPath)
    await watchRoot(connection, root)
    staleClock = (await baseline(connection, root)).clock
    await writeFile(join(root, "outage.ts"), "changed while no subscription existed")
    connection.close()
  } finally {
    await first.kill()
  }
  // No state was saved (--no-save-state), so the replacement instance has no
  // history that could contain the previous instance's clock.
  const second = await startDaemon(scratch)
  try {
    const connection = await connect(socketPath)
    await watchRoot(connection, root)
    const fresh = await baseline(connection, root)
    expect(fresh.names).toEqual([".watchmanconfig", "a.ts", "outage.ts"])
    const pairing = await pair(connection, root, staleClock)
    try {
      await until(() => pairing.invalid(), "restart fresh-instance rejection", 8000)
      expect(pairing.invalid()).toBe(true)
    } finally {
      await pairing.detach()
    }
    // The same foreign clock is also reported by a since-query, confirming the
    // daemon flags it rather than silently treating it as an ordinary delta.
    const since = await connection.query(["query", root, {
      since: staleClock, expression: ["allof", ["exists"]], fields: ["name"], sync_timeout: 10_000
    }], new AbortController().signal, 20_000, 32 * 1024 * 1024)
    expect(since.is_fresh_instance).toBe(true)
    console.log(`[observed-probe] restart staleClock=${staleClock} freshClock=${fresh.clock} sinceQueryFresh=${since.is_fresh_instance} sinceQueryFiles=${JSON.stringify(since.files)}`)
    connection.close()
  } finally {
    await second.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 25_000)

test.skipIf(!binary)("private daemon: epoch guard prevents old queued deletion from losing a recreated file", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-epoch-"))
  const root = join(scratch, "root")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "a.ts"), "old")
  await writeFile(join(root, "stable.ts"), "kept")
  const daemon = await startDaemon(scratch)
  try {
    const connection = await connect(daemon.socketPath)
    await watchRoot(connection, root)
    const q1 = await baseline(connection, root)
    expect(q1.names).toContain("a.ts")
    await unlink(join(root, "a.ts"))
    const old = await pair(connection, root, q1.clock)
    try {
      const deletion = await old.waitFor((frame) => frame.rows.some((row) => row.name === "a.ts" && !row.exists), "old-subscription deletion")
      // Slow consumer: freeze the old-epoch queue at the moment the deletion is known.
      const queued: ReadonlyArray<TaggedChange> = old.frames.slice(0, deletion.seq + 1)
        .flatMap((frame) => frame.rows.map((row) => ({ epoch: 1, subscription: old.name, name: row.name, exists: row.exists })))
      // The deleted file is recreated while the deletion is still queued.
      await writeFile(join(root, "a.ts"), "new")
      const q2 = await baseline(connection, root)
      expect(q2.names).toContain("a.ts")
      // Naive replay of the queued tail loses the recreated file.
      expect(projectNaive(q2.names, queued).has("a.ts")).toBe(false)
      // The epoch guard drops superseded old-subscription work instead.
      const guarded = projectTagged(q2.names, queued, 2)
      expect(guarded.has("a.ts")).toBe(true)
      await pause(300)
      expect([...guarded].sort()).toEqual([...await diskNames(root)].sort())
      // The old subscription itself eventually reports the recreation; the guard
      // exists so correctness never depends on that tail arriving in time.
      await old.waitFor((frame) => frame.rows.some((row) => row.name === "a.ts" && row.exists), "old-subscription recreation")
    } finally {
      await old.detach()
    }
    connection.close()
  } finally {
    await daemon.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 20_000)

})

test.skipIf(!binary)("private daemon: subscribe rows carry lexical type when requested", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/tmp/opencode", "observed-fields-"))
  const root = join(scratch, "root")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_vcs: [] }))
  await writeFile(join(root, "present.ts"), "present")
  await writeFile(join(root, "doomed.ts"), "deleted before subscribe")
  const daemon = await startDaemon(scratch)
  try {
    // A minimal raw client: the library Reply decoder keeps only name/exists/new,
    // so observe first what the daemon actually returns for extended fields.
    const socket = createConnection({ path: daemon.socketPath })
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) })
    let buffer = ""
    const pending: Array<(reply: Record<string, unknown>) => void> = []
    const unilateral: Array<Record<string, unknown>> = []
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      let end = buffer.indexOf("\n")
      while (end >= 0) {
        const reply = JSON.parse(buffer.slice(0, end)) as Record<string, unknown>
        buffer = buffer.slice(end + 1)
        if (typeof reply.subscription === "string") unilateral.push(reply)
        else pending.shift()?.(reply)
        end = buffer.indexOf("\n")
      }
    })
    const call = (command: ReadonlyArray<unknown>) => new Promise<Record<string, unknown>>((resolve) => {
      pending.push(resolve)
      socket.write(JSON.stringify(command) + "\n")
    })
    try {
      await call(["watch", root])
      const clock = await call(["clock", root])
      await unlink(join(root, "doomed.ts"))
      await writeFile(join(root, "raced.ts"), "created before subscribe")
      const acknowledged = await call(["subscribe", root, "raw-fields-probe", {
        since: clock.clock, fields: ["name", "type", "exists", "new"]
      }])
      expect(acknowledged.subscribe).toBe("raw-fields-probe")
      await writeFile(join(root, "live.ts"), "created after acknowledgement")
      await pause(1500)
      const rows = unilateral.flatMap((frame) => (frame.files as Array<Record<string, unknown>>) ?? [])
      const deleted = rows.find((row) => row.exists === false)
      for (const name of ["doomed.ts", "raced.ts", "live.ts"]) expect(rows.some((row) => row.name === name)).toBe(true)
      for (const name of ["doomed.ts", "raced.ts", "live.ts"]) {
        const row = rows.find((candidate) => candidate.name === name)
        if (row && row.exists !== false) expect(row.type).toBe("f")
      }
      console.log(`[observed-probe] raw frames=${unilateral.length} deletedRow=${JSON.stringify(deleted)}`)
      expect(deleted?.name).toBe("doomed.ts")
    } finally {
      socket.destroy()
    }
  } finally {
    await daemon.kill()
    await rm(scratch, { recursive: true, force: true })
  }
}, 15_000)
