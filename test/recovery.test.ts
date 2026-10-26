import { expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Exit, Fiber, Layer, Random, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Glob, Recovery, Watchman } from "../effect-watchman.js"

const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Recovery peer condition timed out")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}
const settle = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 1)))
const advance = (predicate: () => boolean) => Effect.gen(function*() {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Recovery clock condition timed out")
    yield* settle
    yield* TestClock.adjust(1000)
  }
})
const send = (socket: Socket, value: unknown) => socket.write(JSON.stringify(value) + "\n")
type Command = ReadonlyArray<unknown>
const peer = async () => {
  const directory = await mkdtemp("/tmp/opencode/recovery-peer-")
  const socketPath = join(directory, "sock")
  const connections: Socket[] = []
  const commands: Array<{ socket: Socket; command: Command }> = []
  const state = {
    respond: (command: Command, socket: Socket) => {
      if (command[0] === "watch-project" || command[0] === "watch") send(socket, { watch: command[1] })
      if (command[0] === "clock") send(socket, { clock: "c:1:1" })
      if (command[0] === "version") send(socket, { version: "test" })
      if (command[0] === "get-config") send(socket, { config: { ignore_dirs: [], ignore_vcs: [] } })
      if (command[0] === "query") send(socket, { clock: "c:1:2", files: [{ name: "kept.ts", type: "f" }] })
      if (command[0] === "subscribe") send(socket, { subscribe: command[2] })
      if (command[0] === "unsubscribe") send(socket, { unsubscribe: command[2] })
    }
  }
  const server = createServer((socket) => {
    connections.push(socket)
    let buffer = ""
    socket.on("data", (data) => {
      buffer += data.toString()
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n")
        const command: Command = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        commands.push({ socket, command })
        state.respond(command, socket)
      }
    })
    socket.on("error", () => {})
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  return {
    directory, socketPath, connections, commands, state, server,
    async [Symbol.asyncDispose]() {
      connections.forEach((socket) => socket.destroy())
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  }
}
const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer()), Random.withSeed("recovery")))
const healthUntil = (recovery: Recovery.Capability, predicate: (health: Recovery.Health) => boolean) => Effect.gen(function*() {
  const deadline = Date.now() + 3000
  while (!predicate(yield* recovery.health)) {
    if (Date.now() >= deadline) throw new Error("Recovery health condition timed out")
    yield* settle
  }
})

test("checked signals: initial ack boundary, history sequence, local rejection and cancellation isolation", async () => {
  await using fixture = await peer()
  await mkdir(join(fixture.directory, "bad"))
  const common = fixture.state.respond
  fixture.state.respond = (command, socket) => {
    if (command[0] === "watch-project" && command[1] === join(fixture.directory, "bad")) { send(socket, { error: "root rejected" }); return }
    common(command, socket)
    if (command[0] === "subscribe") send(socket, { subscription: command[2], files: [{ name: "ignored", exists: true }, { name: "keep", exists: true }] })
  }
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const signals: Recovery.Signal[] = []
    const watch = yield* recovery.watch(fixture.directory, { recursive: true, ignore: ["ignored"] }).pipe(
      Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped
    )
    yield* Effect.promise(() => until(() => signals.length === 2))
    expect(signals[0]).toEqual({ _tag: "Reset", reason: "initial", generation: 1, sequence: 1 })
    expect(signals[1]).toMatchObject({ _tag: "Event", event: { path: join(fixture.directory, "keep") } })
    const attached = fixture.commands.find((item) => item.command[0] === "subscribe")
    if (!attached) throw new Error("Missing attachment")
    send(attached.socket, { subscription: attached.command[2], is_fresh_instance: true, files: [] })
    yield* Effect.promise(() => until(() => signals.length === 3))
    expect(signals[2]).toEqual({ _tag: "Reset", reason: "history", generation: 1, sequence: 2 })
    const rejected = yield* recovery.watch(join(fixture.directory, "bad")).pipe(Stream.runDrain, Effect.forkScoped)
    expect(Exit.isFailure(yield* Fiber.await(rejected))).toBe(true)
    expect((yield* recovery.health).generation).toBe(1)
    expect(fixture.connections).toHaveLength(1)
    send(attached.socket, { subscription: attached.command[2], canceled: true })
    expect(Exit.isFailure(yield* Fiber.await(watch))).toBe(true)
    // A canceled root is local: subsequent queries/watches reuse this connection.
    const next = yield* recovery.watch(fixture.directory).pipe(Stream.take(1), Stream.runCollect)
    expect(next[0]).toMatchObject({ _tag: "Reset", generation: 1 })
    expect(fixture.connections).toHaveLength(1)
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath }).pipe(Layer.provide(platform)))))
})

test("one owner restores many interests serially, ordinary streams fail, queries use the new shared generation", async () => {
  await using fixture = await peer()
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const fs = yield* Glob.fileSystem
    const signals: Recovery.Signal[] = []
    const watchers = yield* Effect.forEach(Array.from({ length: 40 }), () => recovery.watch(fixture.directory, { recursive: true }).pipe(
      Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped
    ))
    yield* Effect.promise(() => until(() => signals.length === 40))
    const ordinary = yield* fs.watch(fixture.directory).pipe(Stream.runDrain, Effect.forkScoped)
    yield* Effect.promise(() => until(() => fixture.commands.filter((item) => item.command[0] === "subscribe").length === 41))
    expect((yield* fs.enumerate({ root: fixture.directory, coverage: "daemon" })).entries).toEqual([{ path: "kept.ts", type: "File" }])
    fixture.connections[0]?.destroy()
    expect(Exit.isFailure(yield* Fiber.await(ordinary))).toBe(true)
    expect((yield* fs.enumerate({ root: fixture.directory, coverage: "daemon" }).pipe(Effect.result))._tag).toBe("Failure")
    const removed = watchers[0]
    if (!removed) throw new Error("Missing watch fiber")
    yield* Fiber.interrupt(removed)
    yield* advance(() => signals.length === 79)
    expect(signals.slice(40).every((signal) => signal._tag === "Reset" && signal.generation === 2 && signal.sequence === 2 && signal.reason === "transport")).toBe(true)
    expect((yield* recovery.health).interests).toBe(39)
    expect(fixture.connections).toHaveLength(2)
    expect(fixture.commands.filter((item) => item.command[0] === "watch")).toHaveLength(2)
    expect(fixture.commands.filter((item) => item.command[0] === "subscribe")).toHaveLength(80)
    expect((yield* fs.enumerate({ root: fixture.directory, coverage: "daemon" })).entries).toHaveLength(1)
    expect(fixture.connections).toHaveLength(2)
  })).pipe(Effect.provide(Watchman.layerWithGlob({ socketPath: fixture.socketPath, approvedRoots: [fixture.directory], maxPendingCommands: 4 }).pipe(Layer.provide(platform)))))
})

test("idle wedged socket is detected by the shared probe and shutdown cancels recovery", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  let wedge = false
  fixture.state.respond = (command, socket) => { if (!wedge) common(command, socket) }
  const signals: Recovery.Signal[] = []
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    yield* recovery.watch(fixture.directory).pipe(Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped)
    yield* Effect.promise(() => until(() => signals.length === 1))
    // Clear the acquisition wake/probe before wedging an established idle socket.
    yield* settle
    wedge = true
    yield* TestClock.adjust(1000)
    yield* Effect.promise(() => until(() => fixture.commands.some((item) => item.command[0] === "version")))
    yield* Effect.promise(() => until(() => fixture.connections[0]?.destroyed === true))
    expect((yield* recovery.health).state).toBe("recovering")
    expect(fixture.connections).toHaveLength(1)
    // Owner closes while its virtual reconnect sleep is pending.
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath, probeIntervalMs: 1000, probeTimeoutMs: 50, retryMinMs: 1000 }).pipe(Layer.provide(platform)))))
  await until(() => fixture.connections.every((socket) => socket.destroyed))
  expect(fixture.connections).toHaveLength(1)
})

test("overflow cannot silently discard an attachment/reset boundary", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  fixture.state.respond = (command, socket) => {
    common(command, socket)
    if (command[0] === "subscribe") send(socket, { subscription: command[2], files: Array.from({ length: 8 }, (_, index) => ({ name: String(index), exists: true })) })
  }
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const result = yield* recovery.watch(fixture.directory).pipe(Stream.runCollect, Effect.result)
    expect(result._tag).toBe("Failure")
    expect((yield* recovery.health).generation).toBe(1)
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath, maxBufferedEvents: 2 }).pipe(Layer.provide(platform)))))
})

test("daemon absent at construction leaves a degraded owner; opted-in initial attachment recovers", async () => {
  await using fixture = await peer()
  await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const fs = yield* Watchman.fileSystem
    expect((yield* recovery.health).state).toBe("recovering")
    expect((yield* fs.watch(fixture.directory).pipe(Stream.runDrain, Effect.result))._tag).toBe("Failure")
    const signals: Recovery.Signal[] = []
    yield* recovery.watch(fixture.directory).pipe(Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped)
    expect(signals).toEqual([])
    yield* Effect.promise(() => new Promise<void>((resolve) => fixture.server.listen(fixture.socketPath, resolve)))
    yield* advance(() => signals.length === 1)
    expect(signals[0]).toEqual({ _tag: "Reset", reason: "initial", generation: 1, sequence: 1 })
    expect((yield* recovery.health).state).toBe("healthy")
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath }).pipe(Layer.provide(platform)))))
})

test("flaps retain exponential delay, cap attempts, and reset delay only after stable health", async () => {
  await using fixture = await peer()
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const signals: Recovery.Signal[] = []
    yield* recovery.watch(fixture.directory).pipe(Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped)
    yield* Effect.promise(() => until(() => signals.length === 1))
    for (let index = 0; index < 4; index++) {
      const connection = fixture.connections[index]
      if (!connection) throw new Error("Missing connection")
      connection.destroy()
      yield* healthUntil(recovery, (health) => health.state === "recovering" && health.attempts === index + 1)
      const ceiling = Math.min(4000, 1000 * 2 ** index)
      yield* TestClock.adjust(ceiling / 2 - 1)
      yield* settle
      expect(fixture.connections).toHaveLength(index + 1)
      yield* TestClock.adjust(ceiling / 2 + 1)
      yield* Effect.promise(() => until(() => signals.length === index + 2))
      expect((yield* recovery.health).attempts).toBe(index + 1)
    }
    yield* TestClock.adjust(5000)
    yield* healthUntil(recovery, (health) => health.state === "healthy" && health.attempts === 0)
    fixture.connections[4]?.destroy()
    yield* healthUntil(recovery, (health) => health.state === "recovering" && health.attempts === 1)
    yield* TestClock.adjust(499)
    yield* settle
    expect(fixture.connections).toHaveLength(5)
    yield* TestClock.adjust(501)
    yield* Effect.promise(() => until(() => signals.length === 6))
    expect((yield* recovery.health).generation).toBe(6)
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath, retryMinMs: 1000, retryMaxMs: 4000, stableHealthMs: 5000, probeIntervalMs: 1000 }).pipe(Layer.provide(platform)))))
})

test("loss during restoration does not acknowledge an incomplete generation", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  let held: Socket | undefined
  fixture.state.respond = (command, socket) => {
    if (fixture.connections.indexOf(socket) === 1 && command[0] === "subscribe") { held = socket; return }
    common(command, socket)
  }
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const signals: Recovery.Signal[] = []
    yield* recovery.watch(fixture.directory).pipe(Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped)
    yield* Effect.promise(() => until(() => signals.length === 1))
    fixture.connections[0]?.destroy()
    yield* advance(() => held !== undefined)
    expect(signals).toHaveLength(1)
    held?.destroy()
    yield* advance(() => signals.length === 2)
    expect(signals[1]).toEqual({ _tag: "Reset", reason: "transport", generation: 3, sequence: 2 })
    expect(fixture.connections).toHaveLength(3)
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath, retryMinMs: 1000 }).pipe(Layer.provide(platform)))))
})

test("canceled attachment keeps late reply ownership and cleans up without losing sibling signals", async () => {
  await using fixture = await peer()
  const common = fixture.state.respond
  let held: { command: Command; socket: Socket } | undefined
  fixture.state.respond = (command, socket) => {
    if (command[0] === "subscribe" && !held) { held = { command, socket }; return }
    common(command, socket)
  }
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const first = yield* recovery.watch(fixture.directory).pipe(Stream.runDrain, Effect.forkScoped)
    yield* Effect.promise(() => until(() => held !== undefined))
    const closing = yield* Fiber.interrupt(first).pipe(Effect.forkScoped)
    const sibling = yield* recovery.watch(fixture.directory).pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    const pending = held
    if (!pending) throw new Error("Missing pending attachment")
    send(pending.socket, { subscribe: pending.command[2] })
    yield* Fiber.join(closing)
    expect((yield* Fiber.join(sibling))[0]).toMatchObject({ _tag: "Reset", generation: 1 })
    expect(fixture.commands.some((item) => item.command[0] === "unsubscribe" && item.command[2] === pending.command[2])).toBe(true)
    expect(fixture.connections).toHaveLength(1)
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath }).pipe(Layer.provide(platform)))))
})

test("accepted but silent socket hits bounded attachment deadline without false readiness", async () => {
  await using fixture = await peer()
  fixture.state.respond = () => {}
  await run(Effect.scoped(Effect.gen(function*() {
    const recovery = yield* Recovery.fileSystem
    const signals: Recovery.Signal[] = []
    yield* recovery.watch(fixture.directory).pipe(Stream.runForEach((signal) => Effect.sync(() => signals.push(signal))), Effect.forkScoped)
    yield* Effect.promise(() => until(() => fixture.connections[0]?.destroyed === true))
    expect(signals).toEqual([])
    expect((yield* recovery.health).state).toBe("recovering")
  })).pipe(Effect.provide(Watchman.layer({ socketPath: fixture.socketPath, requestTimeoutMs: 50 }).pipe(Layer.provide(platform)))))
})
