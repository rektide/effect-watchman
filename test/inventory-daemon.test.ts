import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { createConnection, createServer, type Socket } from "node:net"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Layer, Stream } from "effect"
import { Inventory, Watchman } from "../effect-watchman.js"
import { encode, readCommands, readFrames } from "./wire.ts"

const binary = process.env.WATCHMAN_TEST_BINARY
const until = async (predicate: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 8000
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Private inventory daemon deadline")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe.each(["json", "bser"] as const)("%s inventory daemon", (wireFormat) => {
test.skipIf(!binary)("private daemon: real public clock join, pre-ack race, fresh rejection, rebaseline and restart", async () => {
  const directory = await mkdtemp("/tmp/opencode/inventory-daemon-")
  const root = join(directory, "root")
  const daemonSocket = join(directory, "daemon.sock")
  const socketPath = join(directory, "proxy.sock")
  await mkdir(join(root, "excluded"), { recursive: true })
  await writeFile(join(root, ".watchmanconfig"), JSON.stringify({ ignore_dirs: ["excluded"], ignore_vcs: [] }))
  await writeFile(join(root, "a.ts"), "old")
  await writeFile(join(root, "victim.ts"), "deleted inside pairing window")
  await writeFile(join(root, "excluded", "sentinel.ts"), "must never be supplemented")
  await writeFile(join(directory, "global.json"), "{}")
  const start = async () => {
    await Promise.all([rm(daemonSocket, { force: true }), rm(join(directory, "pid"), { force: true }), rm(join(directory, "state"), { force: true })])
    const child = spawn(binary ?? "", ["--foreground", "--no-save-state", "--no-site-spawner",
      `--unix-listener-path=${daemonSocket}`, `--statefile=${directory}/state`, `--pidfile=${directory}/pid`, `--logfile=${directory}/log`], {
      env: { ...process.env, WATCHMAN_CONFIG_FILE: join(directory, "global.json"), WATCHMAN_SOCK: "" }, stdio: "ignore"
    })
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
    await until(() => new Promise<boolean>((resolve) => {
      const socket = createConnection({ path: daemonSocket })
      socket.once("connect", () => { socket.destroy(); resolve(true) })
      socket.once("error", () => resolve(false))
    }))
    return { kill: async () => { child.kill("SIGTERM"); await exited } }
  }
  let daemon = await start()
  let foreign = false
  let subscribes = 0
  const commands: ReadonlyArray<unknown>[] = []
  const sockets: Socket[] = []
  const server = createServer((client) => {
    const remote = createConnection({ path: daemonSocket })
    sockets.push(client, remote)
    client.on("error", () => {}); remote.on("error", () => client.destroy())
    client.once("close", () => remote.destroy()); remote.once("close", () => client.destroy())
    let ack: Buffer | undefined
    readCommands(wireFormat, client, (command) => {
        commands.push(command)
        if (command[0] !== "subscribe") { remote.write(encode(wireFormat, command)); return }
        subscribes++
        const options = command[3] as { since: string }
        if (foreign) { foreign = false; options.since = "c:0:0:0:1" }
        // The proxy orders actual disk mutations between the real query and subscribe.
        void (async () => {
          if (subscribes === 1) {
            await unlink(join(root, "victim.ts"))
            await writeFile(join(root, "raced.ts"), "new")
            await unlink(join(root, "a.ts"))
            await writeFile(join(root, "a.ts"), "recreated")
          }
          remote.write(encode(wireFormat, command))
        })()
    })
    readFrames(wireFormat, remote, (input) => {
        if (typeof input !== "object" || input === null) throw new Error("Private daemon frame must be an object")
        const frame = encode(wireFormat, input)
        // Reorder only the first real ack behind its catch-up frame to prove staging deterministically.
        if (subscribes === 1 && "subscribe" in input) { ack = frame; return }
        client.write(frame)
        if (ack && "subscription" in input) { client.write(ack); ack = undefined }
    })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const source = yield* Inventory.fileSystem
      const view = yield* source.open({ root, budgets: { pairRetryMs: 1 } })
      const events: Inventory.InventoryEvent[] = []
      const present = new Set<string>()
      yield* view.events.pipe(Stream.runForEach((event) => Effect.sync(() => {
        events.push(event)
        if (event.type === "baseline") { present.clear(); event.entries.forEach((entry) => present.add(entry.path)) }
        if (event.type === "changes") event.changes.forEach((change) => change.type === "present" ? present.add(change.entry.path) : present.delete(change.path))
      })), Effect.forkScoped)
      // The daemon may split delete/recreate across separate catch-up frames.
      // Readiness for this assertion is the final membership, not the first frame.
      yield* Effect.promise(() => until(() => events.some((event) => event.type === "changes") &&
        present.has("a.ts") && present.has("raced.ts") && !present.has("victim.ts")))
      expect(events[0]).toMatchObject({ type: "baseline", epoch: 1 })
      expect(events[1]).toMatchObject({ type: "changes", epoch: 1, sequence: 1 })
      expect([...present].sort()).toEqual([".watchmanconfig", "a.ts", "raced.ts"])
      const firstQuery = commands.find((command) => command[0] === "query")
      expect(firstQuery).toBeDefined()
      expect(commands.some((command) => command[0] === "clock")).toBe(false)
      expect(commands.filter((command) => command[0] === "subscribe")[0]?.[3]).not.toHaveProperty("expression")
      yield* Effect.promise(() => writeFile(join(root, "live.ts"), "live"))
      yield* Effect.promise(() => until(() => present.has("live.ts")))
      yield* Effect.promise(() => unlink(join(root, "a.ts")))
      yield* Effect.promise(() => until(() => !present.has("a.ts")))
      yield* Effect.promise(() => writeFile(join(root, "a.ts"), "new baseline"))
      foreign = true
      yield* view.rebaseline("fresh-history-proof")
      yield* Effect.promise(() => until(() => subscribes >= 3 && events.some((event) => event.type === "baseline" && event.epoch >= 2)))
      // A late fresh frame may invalidate an acknowledged baseline; its full-inventory rows are never changes.
      yield* Effect.promise(() => until(() => present.has("a.ts")))
      expect(events.filter((event) => event.type === "changes").every((event) => !event.changes.some((change) => change.type === "present" && change.entry.path === ".watchmanconfig"))).toBe(true)
      const before = (yield* view.state).epoch
      yield* Effect.promise(() => daemon.kill())
      yield* Effect.promise(() => writeFile(join(root, "outage.ts"), "outage"))
      daemon = yield* Effect.promise(start)
      yield* Effect.promise(() => until(() => present.has("outage.ts") && events.some((event) => event.type === "baseline" && event.epoch > before)))
      expect([...present].sort()).toEqual([".watchmanconfig", "a.ts", "live.ts", "outage.ts", "raced.ts"])
      yield* Effect.promise(() => writeFile(join(root, "after-restart.ts"), "live on retained view"))
      yield* Effect.promise(() => until(() => present.has("after-restart.ts")))
      expect(events.at(-1)).toMatchObject({ type: "changes", epoch: (yield* view.state).epoch, sequence: 1 })
      expect(yield* view.state).toMatchObject({ state: "active" })
    })).pipe(Effect.provide(Watchman.layerWithGlob({ socketPath, ...(wireFormat === "bser" ? { wireFormat } : {}), approvedRoots: [root], retryMinMs: 5, retryMaxMs: 10 }).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))))))
  } finally {
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await daemon.kill()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
})
