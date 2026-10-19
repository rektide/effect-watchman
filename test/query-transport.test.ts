import { expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Fiber, Layer, Stream } from "effect"
import { Glob, Watchman } from "../effect-watchman.js"
import { Connection } from "../src/Connection.js"

const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Scripted query peer deadline")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}
const send = (socket: Socket, value: unknown) => socket.write(JSON.stringify(value) + "\n")

test("shared exact-root owner: canceled query retains wire ownership; siblings and budget failures survive", async () => {
  const root = await mkdtemp("/tmp/opencode/query-peer-")
  const socketPath = join(root, "sock")
  const commands: Array<ReadonlyArray<unknown>> = []
  const sockets = new Set<Socket>()
  let pending: Socket | undefined
  let subscription: unknown
  let mode = "hold"
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    let buffer = ""
    socket.on("data", (data) => {
      buffer += data.toString()
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n")
        const command: ReadonlyArray<unknown> = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        commands.push(command)
        if (command[0] === "watch") send(socket, { watch: root })
        if (command[0] === "clock") send(socket, { clock: "c:1:1" })
        if (command[0] === "get-config") send(socket, { config: { ignore_dirs: [], ignore_vcs: [] } })
        if (command[0] === "subscribe") { subscription = command[2]; send(socket, { subscribe: subscription }) }
        if (command[0] === "unsubscribe") send(socket, { unsubscribe: command[2] })
        if (command[0] === "query") {
          if (mode === "hold") { pending = socket; continue }
          if (mode === "large") { send(socket, { clock: "c:1:3", files: [{ name: "x".repeat(100), type: "f" }] }); continue }
          if (mode === "bad") { send(socket, { clock: "c:1:4", files: [{ name: "bad", type: null }] }); continue }
          send(socket, { clock: "c:1:5", files: [{ name: "kept.ts", type: "f" }] })
        }
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  try {
    const filesystem = Watchman.layerWithGlob({ socketPath, approvedRoots: [root], maxQueryBytes: 100,
      queryTimeoutMs: 1000, querySyncTimeoutMs: 100, queryLockTimeoutMs: 100
    }).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))
    const events: Array<string> = []
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Glob.fileSystem
      const watcher = yield* fs.watch(root, { recursive: true }).pipe(Stream.runForEach((event) => Effect.sync(() => events.push(event.path))), Effect.forkScoped)
      yield* Effect.promise(() => until(() => subscription !== undefined))
      const query = yield* fs.enumerate({ root, patterns: ["*.ts"] }).pipe(Effect.forkScoped)
      yield* Effect.promise(() => until(() => pending !== undefined))
      yield* Fiber.interrupt(query)
      expect(sockets.size).toBe(1)
      const socket = pending
      if (!socket) throw new Error("Missing pending wire owner")
      send(socket, { clock: "c:1:2", files: [] })
      send(socket, { subscription, files: [{ name: "after-cancel", exists: true, new: true }] })
      yield* Effect.promise(() => until(() => events.length === 1))
      mode = "large"
      expect((yield* fs.enumerate({ root }).pipe(Effect.result))._tag).toBe("Failure")
      mode = "bad"
      expect((yield* fs.enumerate({ root }).pipe(Effect.result))._tag).toBe("Failure")
      mode = "ok"
      const result = yield* fs.enumerate({ root, patterns: ["*.ts"] })
      expect(result.entries).toEqual([{ path: "kept.ts", type: "File" }])
      expect(commands.filter((command) => command[0] === "watch")).toHaveLength(1)
      expect(commands.some((command) => command[0] === "watch-project")).toBe(false)
      expect(sockets.size).toBe(1)
      yield* Fiber.interrupt(watcher)
    })).pipe(Effect.provide(filesystem)))
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

test("query decoder accepts name strings and rich optional/null fields without subscription-schema loss", async () => {
  const root = await mkdtemp("/tmp/opencode/query-decode-")
  const socketPath = join(root, "sock")
  const sockets = new Set<Socket>()
  const replies = [
    { clock: "c:1:1", is_fresh_instance: true, files: ["name.ts"] },
    { clock: "c:1:2", files: [{ name: "name.ts", type: "f", size: 12, mtime_ms: 1234 }, { name: "null", type: "l", size: null, mtime_ms: null }] }
  ]
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on("data", () => send(socket, replies.shift()))
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  const connection = new Connection({ socketPath })
  try {
    const signal = new AbortController().signal
    await connection.connect(signal)
    const first = await connection.query(["query"], signal, 1000, 1000)
    expect(first.files).toEqual(["name.ts"])
    expect(first.is_fresh_instance).toBe(true)
    const second = await connection.query(["query"], signal, 1000, 1000)
    expect(second.files).toEqual([{ name: "name.ts", type: "f", size: 12, mtime_ms: 1234 }, { name: "null", type: "l", size: null, mtime_ms: null }])
  } finally {
    connection.close()
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
