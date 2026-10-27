import { expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Fiber, Layer, Stream } from "effect"
import { Glob, Inventory, Watchman } from "../effect-watchman.js"

type Command = ReadonlyArray<unknown>
const send = (socket: Socket, value: unknown) => socket.write(JSON.stringify(value) + "\n")
const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Inventory fixture deadline")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}
const peer = async () => {
  const root = await mkdtemp("/tmp/opencode/inventory-peer-")
  const socketPath = join(root, "sock")
  const sockets: Socket[] = []
  const commands: Array<{ command: Command; socket: Socket }> = []
  const state = { respond: (command: Command, socket: Socket) => {
    if (command[0] === "watch") send(socket, { watch: root })
    if (command[0] === "get-config") send(socket, { config: { ignore_dirs: [], ignore_vcs: [] } })
    if (command[0] === "query") send(socket, { clock: "c:1:2", is_fresh_instance: true, files: [{ name: "a.ts", type: "f", size: 3, mtime_ms: 1 }] })
    if (command[0] === "subscribe") send(socket, { subscribe: command[2] })
    if (command[0] === "unsubscribe") send(socket, { unsubscribe: command[2] })
    if (command[0] === "version") send(socket, { version: "test" })
  } }
  const server = createServer((socket) => {
    sockets.push(socket)
    socket.on("error", () => {})
    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n")
        const command: Command = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        commands.push({ command, socket })
        state.respond(command, socket)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  return { root, socketPath, state, commands, sockets,
    layer: Watchman.layerWithGlob({ socketPath, approvedRoots: [root], retryMinMs: 1, retryMaxMs: 1 }).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
    async [Symbol.asyncDispose]() {
      sockets.forEach((socket) => socket.destroy())
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  }
}
const latest = (fixture: Awaited<ReturnType<typeof peer>>) => {
  const item = fixture.commands.filter((item) => item.command[0] === "subscribe").at(-1)
  if (!item) throw new Error("No subscribe")
  return item
}

test("public observed source joins query clock, stages before ack and classifies only exists", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  fixture.state.respond = (command, socket) => {
    if (command[0] !== "subscribe") { common(command, socket); return }
    expect(command[3]).toMatchObject({ since: "c:1:2", fields: ["name", "type", "exists", "new", "size", "mtime_ms"] })
    expect(command[3]).not.toHaveProperty("expression")
    send(socket, { subscription: command[2], files: [
      { name: "a.ts", exists: false, type: "stale-unknown", size: 999 },
      { name: "b.ts", exists: true, new: false, type: "f", size: 4, mtime_ms: 2 }
    ] })
    common(command, socket)
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root })
    const events = yield* view.events.pipe(Stream.take(2), Stream.runCollect)
    expect(events).toEqual([
      { type: "baseline", epoch: 1, entries: [{ path: "a.ts", type: "File", size: 3, mtimeMs: 1 }] },
      { type: "changes", epoch: 1, sequence: 1, changes: [{ type: "removed", path: "a.ts" }, { type: "present", entry: { path: "b.ts", type: "File", size: 4, mtimeMs: 2 } }] }
    ])
    expect(yield* view.state).toEqual({ state: "active", epoch: 1 })
    expect((yield* view.events.pipe(Stream.runDrain, Effect.result))._tag).toBe("Failure")
  })).pipe(Effect.provide(fixture.layer)))
  expect(fixture.commands.filter((item) => item.command[0] === "watch")).toHaveLength(1)
  expect(fixture.commands.at(-1)?.command[0]).toBe("unsubscribe")
})

test("observed membership preserves source row order; finite enumeration still sorts and deduplicates", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  const names = ["z.ts", "é.ts", "A.ts", "a.ts", "10.ts", "2.ts", "_x.ts"]
  let queries = 0
  fixture.state.respond = (command, socket) => {
    if (command[0] !== "query") { common(command, socket); return }
    send(socket, { clock: "c:1:2", files: [...names, ...(queries++ ? ["z.ts"] : [])].map((name) => ({ name, type: "f", size: null, mtime_ms: null })) })
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root })
    const events = yield* view.events.pipe(Stream.take(1), Stream.runCollect)
    const baseline = events[0]
    if (baseline?.type !== "baseline") throw new Error("Missing baseline")
    expect(baseline.entries.map((entry) => entry.path)).toEqual(names)
    expect(new Set(baseline.entries.map((entry) => entry.path))).toEqual(new Set(names))
    expect(baseline.entries.every((entry) => entry.type === "File" && entry.size === undefined && entry.mtimeMs === undefined)).toBe(true)
    const fs = yield* Glob.fileSystem
    const finite = yield* fs.enumerate({ root: fixture.root, patterns: ["*.ts"], coverage: "daemon" })
    expect(finite.entries.map((entry) => entry.path)).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")))
  })).pipe(Effect.provide(fixture.layer)))
})

test("fresh pre-ack frames reject every row, retry boundedly, and keep the shared owner usable", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  let attempts = 0
  fixture.state.respond = (command, socket) => {
    if (command[0] === "subscribe") {
      attempts++
      send(socket, { subscription: command[2], is_fresh_instance: true, files: [{ name: "forbidden", exists: true, type: "f" }] })
    }
    common(command, socket)
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root, budgets: { maxPairAttempts: 2, pairRetryMs: 1 } })
    const events: Inventory.InventoryEvent[] = []
    expect((yield* view.events.pipe(Stream.runForEach((event) => Effect.sync(() => events.push(event))), Effect.result))._tag).toBe("Failure")
    expect(events).toEqual([])
    expect(attempts).toBe(2)
    expect(yield* view.state).toMatchObject({ state: "failed" })
    const fs = yield* Glob.fileSystem
    expect((yield* fs.enumerate({ root: fixture.root, coverage: "daemon" })).entries).toHaveLength(1)
  })).pipe(Effect.provide(fixture.layer)))
})

test("rebaseline clears queued old deletion, detaches callbacks, and reconnects inside the same view", async () => {
  await using fixture = await peer()
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root })
    yield* Effect.promise(() => until(() => fixture.commands.some((item) => item.command[0] === "subscribe")))
    const old = latest(fixture)
    send(old.socket, { subscription: old.command[2], files: [{ name: "a.ts", exists: false }] })
    yield* view.rebaseline("recreated")
    yield* Effect.promise(() => until(() => fixture.commands.filter((item) => item.command[0] === "subscribe").length === 2))
    send(old.socket, { subscription: old.command[2], files: [{ name: "a.ts", exists: false }] })
    const events: Inventory.InventoryEvent[] = []
    yield* view.events.pipe(Stream.runForEach((event) => Effect.sync(() => events.push(event))), Effect.forkScoped)
    yield* Effect.promise(() => until(() => events.length >= 2))
    expect(events).toMatchObject([{ type: "invalidated", epoch: 1 }, { type: "baseline", epoch: 2 }])
    expect(events.some((event) => event.type === "changes" && event.epoch === 1)).toBe(false)
    latest(fixture).socket.destroy()
    yield* Effect.promise(() => until(() => events.some((event) => event.type === "baseline" && event.epoch === 3)))
    expect(events.slice(-2)).toMatchObject([{ type: "invalidated", epoch: 2 }, { type: "baseline", epoch: 3 }])
    expect(fixture.sockets).toHaveLength(2)
    expect(yield* view.state).toEqual({ state: "active", epoch: 3 })
  })).pipe(Effect.provide(fixture.layer)))
})

test("reset during an in-flight baseline cannot publish the obsolete build", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  let queries = 0
  let held: Socket | undefined
  fixture.state.respond = (command, socket) => {
    if (command[0] === "query" && ++queries === 1) { held = socket; return }
    common(command, socket)
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root })
    yield* Effect.promise(() => until(() => held !== undefined))
    yield* view.rebaseline("reset during query")
    if (!held) throw new Error("Missing held query")
    send(held, { clock: "c:1:1", files: [{ name: "obsolete", type: "f" }] })
    expect(yield* view.events.pipe(Stream.take(2), Stream.runCollect)).toMatchObject([
      { type: "invalidated", epoch: 1 }, { type: "baseline", epoch: 2, entries: [{ path: "a.ts" }] }
    ])
    expect(fixture.commands.filter((item) => item.command[0] === "subscribe")).toHaveLength(1)
  })).pipe(Effect.provide(fixture.layer)))
})

test.each([{ maxQueuedRows: 1 }, { maxQueuedBytes: 1 }])("source overflow is terminal, not silent loss: %j", async (budgets) => {
  await using fixture = await peer()
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: fixture.root, budgets })
    yield* Effect.promise(() => until(() => fixture.commands.some((item) => item.command[0] === "subscribe")))
    const item = latest(fixture)
    send(item.socket, { subscription: item.command[2], files: [{ name: "a", exists: false }, { name: "b", exists: false }] })
    const result = yield* view.events.pipe(Stream.runDrain, Effect.forkScoped)
    expect((yield* Fiber.join(result).pipe(Effect.result))._tag).toBe("Failure")
    expect(yield* view.state).toMatchObject({ state: "failed" })
    expect((yield* view.rebaseline("cannot restart terminal view").pipe(Effect.result))._tag).toBe("Failure")
  })).pipe(Effect.provide(fixture.layer)))
})

test("requested excluded root fails before querying; no local supplementation", async () => {
  await using fixture = await peer()
  await mkdir(join(fixture.root, "excluded"))
  const common = fixture.state.respond
  fixture.state.respond = (command, socket) => {
    if (command[0] === "get-config") { send(socket, { config: { ignore_dirs: ["excluded"], ignore_vcs: [] } }); return }
    common(command, socket)
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Inventory.fileSystem
    const view = yield* source.open({ root: join(fixture.root, "excluded") })
    expect((yield* view.events.pipe(Stream.runDrain, Effect.result))._tag).toBe("Failure")
    expect(yield* view.state).toMatchObject({ state: "failed", reason: expect.stringContaining("source conflict") })
  })).pipe(Effect.provide(fixture.layer)))
  expect(fixture.commands.some((item) => item.command[0] === "query")).toBe(false)
})
