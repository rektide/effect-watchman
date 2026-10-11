import { expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Fiber, Layer, Stream } from "effect"
import { Watchman } from "../effect-watchman.js"
import { Connection, Delivery } from "../src/Connection.js"

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await pause(10) }
  throw new Error("Scripted peer condition timed out")
}
const fixture = async (run: (peer: {
  socketPath: string; directory: string; sockets: Set<Socket>; commands: Array<ReadonlyArray<unknown>>
}) => Promise<void>, respond: (command: ReadonlyArray<unknown>, socket: Socket, directory: string) => void) => {
  const directory = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/home/rektide/tmp-opencode", "watchman-peer-"))
  const socketPath = join(directory, "peer.sock")
  const sockets = new Set<Socket>()
  const commands: Array<ReadonlyArray<unknown>> = []
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    let buffer = ""
    socket.on("data", (data) => {
      buffer += data.toString("utf8")
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n")
        const command: ReadonlyArray<unknown> = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        commands.push(command)
        respond(command, socket, directory)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  try { await run({ socketPath, directory, sockets, commands }) }
  finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}
const reply = (socket: Socket, value: unknown) => socket.write(JSON.stringify(value) + "\n")
const common = (command: ReadonlyArray<unknown>, socket: Socket, directory: string) => {
  if (command[0] === "watch-project") reply(socket, { watch: directory })
  if (command[0] === "clock") reply(socket, { clock: "c:1:1" })
  if (command[0] === "unsubscribe") reply(socket, { unsubscribe: command[2], deleted: true })
}
const publicLayer = (socketPath: string, cleanupTimeoutMs = 100) => Watchman.layer({ socketPath, requestTimeoutMs: 500, cleanupTimeoutMs }).pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
)

test("public socket route filters cookie crossfire by default and permits explicit opt-out", async () => {
  await fixture(async (peer) => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      const filtered = yield* fs.watch(peer.directory, { recursive: true, ignore: ["ignored"] }).pipe(Stream.take(1), Stream.runCollect)
      expect(filtered.map((event) => event.path)).toEqual([join(peer.directory, "keep")])
      const raw = yield* fs.watch(peer.directory, { recursive: true, ignore: ["ignored"], defaultIgnores: false }).pipe(Stream.take(3), Stream.runCollect)
      expect(raw.map((event) => event.path)).toEqual([
        join(peer.directory, ".watchman-cookie-root"), join(peer.directory, "nested/.watchman-cookie-nested"), join(peer.directory, "keep")
      ])
    })).pipe(Effect.provide(publicLayer(peer.socketPath))))
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] !== "subscribe") return
    reply(socket, { subscribe: command[2] })
    reply(socket, { subscription: command[2], files: [
      { name: ".watchman-cookie-root", exists: true, new: true },
      { name: "nested/.watchman-cookie-nested", exists: false },
      { name: "ignored/file", exists: true },
      { name: "keep", exists: true }
    ] })
  })
})

test("socket-configured instance ignores remain active when defaults are disabled", async () => {
  await fixture(async (peer) => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      const result = yield* fs.watch(peer.directory, { recursive: true, ignore: ["caller"] }).pipe(Stream.take(2), Stream.runCollect)
      expect(result.map((event) => event.path)).toEqual([
        join(peer.directory, "nested/.watchman-cookie-visible"), join(peer.directory, "keep")
      ])
    })).pipe(Effect.provide(Watchman.layer({
      socketPath: peer.socketPath, ignore: ["instance"], defaultIgnores: false
    }).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))))))
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] !== "subscribe") return
    reply(socket, { subscribe: command[2] })
    reply(socket, { subscription: command[2], files: [
      { name: "instance/file", exists: true },
      { name: "caller/file", exists: false },
      { name: "nested/.watchman-cookie-visible", exists: true, new: true },
      { name: "keep", exists: true }
    ] })
  })
})

test("interrupting delayed attach B preserves A and cleans late B acknowledgement", async () => {
  await fixture(async (peer) => {
    const a: Array<string> = []
    const b: Array<string> = []
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      yield* fs.watch(peer.directory).pipe(Stream.runForEach((event) => Effect.sync(() => a.push(event.path))), Effect.forkScoped)
      yield* Effect.promise(() => until(() => peer.commands.some((command) => command[0] === "subscribe")))
      yield* Effect.sleep("20 millis")
      const attaching = yield* fs.watch(peer.directory).pipe(Stream.runForEach((event) => Effect.sync(() => b.push(event.path))), Effect.forkScoped)
      yield* Effect.promise(() => until(() => peer.commands.filter((command) => command[0] === "subscribe").length === 2))
      yield* Fiber.interrupt(attaching)
      expect(peer.sockets.size).toBe(1)
      const subscriptions = peer.commands.filter((command) => command[0] === "subscribe")
      expect(peer.commands.some((command) => command[0] === "unsubscribe" && command[2] === subscriptions[1]?.[2])).toBe(true)
      yield* Effect.promise(async () => {
        const socket = [...peer.sockets][0]
        if (!socket) throw new Error("healthy sibling socket was destroyed")
        reply(socket, { subscription: subscriptions[0]?.[2], files: [{ name: "a-alive", exists: true, new: true }] })
        await until(() => a.includes(join(peer.directory, "a-alive")))
      })
      expect(b).toEqual([])
    })).pipe(Effect.provide(publicLayer(peer.socketPath, 50))))
    await until(() => peer.sockets.size === 0)
    expect(peer.commands.filter((command) => command[0] === "unsubscribe")).toHaveLength(2)
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] !== "subscribe") return
    if (command[2] === "effect-watchman-1") { reply(socket, { subscribe: command[2] }); return }
    setTimeout(() => {
      reply(socket, { subscribe: command[2] })
      reply(socket, { subscription: command[2], files: [{ name: "late-b", exists: true, new: true }] })
    }, 100)
  })
})

test("cached project acquisition is manager-owned when first requester is interrupted", async () => {
  await fixture(async (peer) => {
    const events: Array<string> = []
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      const first = yield* fs.watch(peer.directory).pipe(Stream.runDrain, Effect.forkScoped)
      yield* Effect.promise(() => until(() => peer.commands.some((command) => command[0] === "watch-project")))
      yield* fs.watch(peer.directory).pipe(Stream.runForEach((event) => Effect.sync(() => events.push(event.path))), Effect.forkScoped)
      yield* Effect.sleep("20 millis")
      yield* Fiber.interrupt(first)
      yield* Effect.promise(() => until(() => events.length === 1))
      expect(events).toEqual([join(peer.directory, "survivor")])
      expect(peer.commands.filter((command) => command[0] === "watch-project")).toHaveLength(1)
    })).pipe(Effect.provide(publicLayer(peer.socketPath, 300))))
    await until(() => peer.sockets.size === 0)
  }, (command, socket, directory) => {
    if (command[0] === "watch-project") { setTimeout(() => reply(socket, { watch: directory }), 80); return }
    common(command, socket, directory)
    if (command[0] === "subscribe") {
      reply(socket, { subscribe: command[2] })
      reply(socket, { subscription: command[2], files: [{ name: "survivor", exists: true, new: true }] })
    }
  })
})

test("rejected subscription releases acquired listener and connection through public layer", async () => {
  await fixture(async (peer) => {
    const result = await Effect.runPromise(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      return yield* fs.watch(peer.directory).pipe(Stream.runDrain, Effect.result)
    }).pipe(Effect.provide(publicLayer(peer.socketPath))))
    expect(result._tag).toBe("Failure")
    await until(() => peer.sockets.size === 0)
    expect(peer.commands.filter((command) => command[0] === "unsubscribe")).toHaveLength(1)
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] === "subscribe") reply(socket, { error: "attach rejected" })
  })
})

test("mismatched reply settles outstanding AND queued commands without losing pending owner", async () => {
  await fixture(async (peer) => {
    const connection = new Connection({ socketPath: peer.socketPath, requestTimeoutMs: 500 })
    try {
      const signal = new AbortController().signal
      await connection.connect(signal)
      const started = Date.now()
      const results = await Promise.allSettled([
        connection.command(["clock", "root"], "clock", undefined, signal),
        connection.command(["clock", "root"], "clock", undefined, signal)
      ])
      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"])
      expect(Date.now() - started).toBeLessThan(300)
      await until(() => peer.sockets.size === 0)
      expect(peer.commands).toHaveLength(1)
    } finally { connection.close() }
  }, (_command, socket) => reply(socket, { subscribe: "wrong" }))
})

test("unilateral cancellation is terminal before push discrimination", async () => {
  await fixture(async (peer) => {
    const result = await Effect.runPromise(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      return yield* fs.watch(peer.directory).pipe(Stream.runCollect, Effect.result)
    }).pipe(Effect.provide(publicLayer(peer.socketPath))))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(String(result.failure)).toContain("canceled")
    await until(() => peer.sockets.size === 0)
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] === "subscribe") {
      reply(socket, { subscribe: command[2] })
      reply(socket, { unilateral: true, subscription: command[2], canceled: true, files: [] })
    }
  })
})

test("split UTF-8 and multiple JSON frames preserve push delivery", async () => {
  await fixture(async (peer) => {
    const events = await Effect.runPromise(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      return yield* fs.watch(peer.directory).pipe(Stream.take(2), Stream.runCollect)
    }).pipe(Effect.provide(publicLayer(peer.socketPath))))
    expect(events).toEqual([
      { _tag: "Create", path: join(peer.directory, "café") },
      { _tag: "Remove", path: join(peer.directory, "gone") }
    ])
    await until(() => peer.sockets.size === 0)
  }, (command, socket, directory) => {
    common(command, socket, directory)
    if (command[0] === "subscribe") {
      const frames = Buffer.from(JSON.stringify({ subscribe: command[2] }) + "\n" +
        JSON.stringify({ subscription: command[2], files: [{ name: "café", exists: true, new: true }] }) + "\n" +
        JSON.stringify({ subscription: command[2], files: [{ name: "gone", exists: false }] }) + "\n")
      const split = frames.indexOf(Buffer.from("é")) + 1
      socket.write(frames.subarray(0, split))
      setTimeout(() => socket.write(frames.subarray(split)), 10)
    }
  })
})

test("malformed JSON/schema/UTF-8 and oversized frames are latched terminal failures", async () => {
  for (const data of [Buffer.from("not JSON\n"), Buffer.from('{"clock":123}\n'), Buffer.from([123, 34, 255, 34, 58, 49, 125, 10]), Buffer.from("x".repeat(33))]) {
    await fixture(async (peer) => {
      const connection = new Connection({ socketPath: peer.socketPath, maxFrameBytes: 32, requestTimeoutMs: 500 })
      try {
        const signal = new AbortController().signal
        await connection.connect(signal)
        const results = await Promise.allSettled([connection.command(["clock"], "clock", undefined, signal)])
        expect(results[0]?.status).toBe("rejected")
        expect(() => connection.check()).toThrow()
        await until(() => peer.sockets.size === 0)
      } finally { connection.close() }
    }, (_command, socket) => socket.write(data))
  }
})

test("silent wire request still reaches terminal deadline after caller cancellation", async () => {
  for (const cancel of [false, true]) {
    await fixture(async (peer) => {
      const connection = new Connection({ socketPath: peer.socketPath, requestTimeoutMs: 100 })
      try {
        const controller = new AbortController()
        await connection.connect(controller.signal)
        const first = connection.command(["clock"], "clock", undefined, controller.signal)
        const second = connection.command(["clock"], "clock", undefined, controller.signal)
        const settled = Promise.allSettled([first, second])
        await until(() => peer.commands.length === 1)
        if (cancel) controller.abort()
        expect((await settled).map((result) => result.status)).toEqual(["rejected", "rejected"])
        if (cancel) {
          await pause(20)
          expect(peer.sockets.size).toBe(1)
        }
        await until(() => peer.sockets.size === 0)
      } finally { connection.close() }
    }, () => undefined)
  }
})

test("interrupted subscribe with silent wire reply still has bounded cleanup", async () => {
  await fixture(async (peer) => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      const fiber = yield* fs.watch(peer.directory).pipe(Stream.runDrain, Effect.forkScoped)
      yield* Effect.promise(() => until(() => peer.commands.some((command) => command[0] === "subscribe")))
      yield* Fiber.interrupt(fiber)
      yield* Effect.promise(() => until(() => peer.sockets.size === 0))
    })).pipe(Effect.provide(publicLayer(peer.socketPath))))
  }, common)
})

test("silent unsubscribe cannot hang scope close", async () => {
  await fixture(async (peer) => {
    const start = Date.now()
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      yield* fs.watch(peer.directory).pipe(Stream.runDrain, Effect.forkScoped)
      yield* Effect.promise(() => until(() => peer.commands.some((command) => command[0] === "subscribe")))
      yield* Effect.sleep("20 millis")
    })).pipe(Effect.provide(publicLayer(peer.socketPath, 100))))
    expect(Date.now() - start).toBeLessThan(600)
    await until(() => peer.sockets.size === 0)
    expect(peer.commands.some((command) => command[0] === "unsubscribe")).toBe(true)
  }, (command, socket, directory) => {
    if (command[0] === "watch-project" || command[0] === "clock") common(command, socket, directory)
    if (command[0] === "subscribe") reply(socket, { subscribe: command[2] })
  })
})

test("bounded delivery overflow discards buffered hints and latches failure", async () => {
  const delivery = new Delivery<number>(1)
  delivery.push(1)
  delivery.push(2)
  const iterator = delivery[Symbol.asyncIterator]()
  await expect(iterator.next()).rejects.toThrow("overflow")
  delivery.push(3)
  delivery.fail(new Error("later cleanup must not replace loss"))
  await expect(iterator.next()).rejects.toThrow("overflow")
})

test("unsent cancellation skips only its command and frees bounded queue capacity", async () => {
  await fixture(async (peer) => {
    const connection = new Connection({ socketPath: peer.socketPath, requestTimeoutMs: 500, maxPendingCommands: 2 })
    try {
      const signal = new AbortController().signal
      await connection.connect(signal)
      const first = connection.command(["clock", "first"], "clock", undefined, signal)
      await until(() => peer.commands.length === 1)
      const controller = new AbortController()
      const canceled = connection.command(["clock", "never-sent"], "clock", undefined, controller.signal)
      const cancellation = Promise.allSettled([canceled])
      controller.abort()
      expect((await cancellation)[0]?.status).toBe("rejected")
      const third = connection.command(["clock", "third"], "clock", undefined, signal)
      await pause(20)
      expect(peer.sockets.size).toBe(1)
      expect(peer.commands).toEqual([["clock", "first"]])
      const socket = [...peer.sockets][0]
      if (!socket) throw new Error("unsent cancellation destroyed socket")
      reply(socket, { clock: "c:first" })
      expect((await first).clock).toBe("c:first")
      expect((await third).clock).toBe("c:third")
      expect(peer.commands).toEqual([["clock", "first"], ["clock", "third"]])
      const alreadyCanceled = new AbortController()
      alreadyCanceled.abort()
      await expect(connection.command(["clock", "also-never-sent"], "clock", undefined, alreadyCanceled.signal)).rejects.toThrow("before transmission")
      connection.check()
    } finally { connection.close() }
    await until(() => peer.sockets.size === 0)
  }, (command, socket) => { if (command[1] === "third") reply(socket, { clock: "c:third" }) })
})

test("public watch preserves terminal disconnect/fresh-history/overflow as typed failure", async () => {
  for (const loss of ["disconnect", "fresh", "overflow"]) {
    await fixture(async (peer) => {
      const layer = Watchman.layer({ socketPath: peer.socketPath, maxBufferedEvents: 1 }).pipe(
        Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
      )
      const result = await Effect.runPromise(Effect.gen(function*() {
        const fs = yield* Watchman.fileSystem
        return yield* fs.watch(peer.directory).pipe(Stream.runCollect, Effect.result)
      }).pipe(Effect.provide(layer)))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("Unknown")
      await until(() => peer.sockets.size === 0)
    }, (command, socket, directory) => {
      common(command, socket, directory)
      if (command[0] !== "subscribe") return
      reply(socket, { subscribe: command[2] })
      if (loss === "disconnect") { socket.end(); return }
      reply(socket, { subscription: command[2], is_fresh_instance: loss === "fresh",
        files: ["one", "two", "three"].map((name) => ({ name, exists: true, new: true })) })
    })
  }
})
