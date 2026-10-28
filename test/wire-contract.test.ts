import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Socket } from "node:net"
import { endianness } from "node:os"
import { join } from "node:path"
import { dumpToBuffer } from "@superbfowle/bser-esm"
import { Connection, SubscriptionCanceled } from "watchman-client-json"
import { makeConnection, type ConnectionOptions, type WireConnection } from "../src/Connection.ts"
import { encode, readCommands, type WireFormat } from "./wire.ts"

const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Wire contract peer deadline")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

const fixture = async (wireFormat: WireFormat, run: (peer: {
  connection: WireConnection; commands: ReadonlyArray<unknown>[]; socket: () => Socket
}) => Promise<void>, respond: (command: ReadonlyArray<unknown>, socket: Socket) => void = () => {}, limits: Partial<ConnectionOptions> = {}) => {
  const directory = await mkdtemp("/tmp/opencode/wire-contract-")
  const sockets = new Set<Socket>()
  const commands: ReadonlyArray<unknown>[] = []
  const socketPath = join(directory, "peer.sock")
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    readCommands(wireFormat, socket, (command) => { commands.push(command); respond(command, socket) })
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  const connection = makeConnection({ socketPath, wireFormat, requestTimeoutMs: 1000, ...limits })
  try {
    await connection.connect(new AbortController().signal)
    await until(() => sockets.size === 1)
    await run({ connection, commands, socket: () => {
      const socket = [...sockets][0]
      if (!socket) throw new Error("Peer socket missing")
      return socket
    } })
  } finally {
    connection.close()
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}

test("omitting wireFormat consumes the extracted JSON Connection", () => {
  const connection = makeConnection({ socketPath: "/unused" })
  expect(connection).toBeInstanceOf(Connection)
  connection.close()
  expect(() => Reflect.apply(makeConnection, undefined, [{ socketPath: "/unused", wireFormat: "auto" }])).toThrow("wireFormat")
})

describe.each(["json", "bser"] as const)("%s wire contract", (wireFormat) => {
  const signal = () => new AbortController().signal
  test("abandoned transmitted query owns the wire until its reply, not the next queued query", async () => {
    await fixture(wireFormat, async ({ connection, commands, socket }) => {
      const controller = new AbortController()
      const first = connection.query(["query", "first"], controller.signal, 1000, 1000)
      const canceled = Promise.allSettled([first])
      await until(() => commands.length === 1)
      controller.abort()
      expect((await canceled)[0]?.status).toBe("rejected")
      const second = connection.query(["query", "second"], signal(), 1000, 1000)
      expect(commands).toEqual([["query", "first"]])
      socket().write(encode(wireFormat, { clock: "c:abandoned", files: ["old"] }))
      await until(() => commands.length === 2)
      socket().write(encode(wireFormat, { clock: "c:next", files: ["next"] }))
      expect(await second).toEqual({ clock: "c:next", files: ["next"] })
      connection.check()
    })
  })

  test("named cancellation wins over payload; state/error/data preserve listener and row ordering", async () => {
    await fixture(wireFormat, async ({ connection, socket }) => {
      const pushed: unknown[] = []
      const failures: Error[] = []
      connection.listen("a", { push: (frame) => pushed.push(frame), fail: (error) => failures.push(error) })
      connection.listen("b", { push: (frame) => pushed.push(frame), fail: (error) => failures.push(error) })
      const pending = connection.command(["clock"], "clock", undefined, signal())
      socket().write(Buffer.concat([
        encode(wireFormat, { subscription: "a", canceled: true, files: "deliberately invalid" }),
        encode(wireFormat, { subscription: "b", "state-enter": "test" }),
        encode(wireFormat, { subscription: "b", error: "subscription-local error" }),
        encode(wireFormat, { subscription: "b", files: [{ name: "z", exists: false }, { name: "a", exists: true }] }),
        encode(wireFormat, { clock: "c:reply" })
      ]))
      expect((await pending).clock).toBe("c:reply")
      expect(failures).toHaveLength(1)
      expect(failures[0]).toBeInstanceOf(SubscriptionCanceled)
      expect(connection.listeners.has("a")).toBe(false)
      expect(connection.listeners.has("b")).toBe(true)
      expect(pushed).toEqual([
        { subscription: "b" }, { subscription: "b", error: "subscription-local error" },
        { subscription: "b", files: [{ name: "z", exists: false }, { name: "a", exists: true }] }
      ])
    })
  })

  test("unknown subscriptions still validate completely; malformed last row never publishes a prefix", async () => {
    for (const name of ["known", "unknown"]) await fixture(wireFormat, async ({ connection, socket }) => {
      const pushed: unknown[] = []
      const failed: Error[] = []
      connection.listen("known", { push: (frame) => pushed.push(frame), fail: (error) => failed.push(error) })
      const pending = connection.command(["clock"], "clock", undefined, signal())
      const settled = Promise.allSettled([pending])
      socket().write(Buffer.concat([
        encode(wireFormat, { subscription: name, files: [{ name: "valid", exists: true }, { name: "bad", exists: "wrong" }] }),
        encode(wireFormat, { clock: "must-not-settle" })
      ]))
      expect((await settled)[0]?.status).toBe("rejected")
      expect(pushed).toEqual([])
      expect(failed).toHaveLength(1)
      expect(() => connection.check()).toThrow()
    })
  })

  test("query schema, budget, warning and daemon errors remain operation-local to healthy siblings", async () => {
    await fixture(wireFormat, async ({ connection }) => {
      const frames: unknown[] = []
      const failures: Error[] = []
      connection.listen("sibling", { push: (frame) => frames.push(frame), fail: (error) => failures.push(error) })
      for (const mode of ["schema", "budget", "warning", "error"]) {
        await expect(connection.query(["query", mode], signal(), 1000, mode === "budget" ? 1 : 1000)).rejects.toThrow()
        connection.check()
      }
      expect(await connection.query(["query", "ok"], signal(), 1000, 1000)).toEqual({ clock: "c:ok", files: [] })
      expect(frames).toHaveLength(5)
      expect(failures).toEqual([])
    }, (command, socket) => {
      socket.write(encode(wireFormat, { subscription: "sibling", files: [{ name: String(command[1]), exists: true }] }))
      const mode = command[1]
      socket.write(encode(wireFormat, mode === "schema" ? { clock: "c:bad", files: [{ name: "bad", type: null }] }
        : mode === "warning" ? { clock: "c:warning", files: [], warning: "incomplete" }
        : mode === "error" ? { error: "query rejected" } : { clock: "c:ok", files: [] }))
    })
  })

  test("payload-byte budget equality is legal and excludes each frame header/delimiter", async () => {
    const value = { clock: "c:exact", files: ["café"] }
    const bytes = encode(wireFormat, value).length - (wireFormat === "bser" ? 7 : 1)
    await fixture(wireFormat, async ({ connection }) => {
      expect(await connection.query(["query"], signal(), 1000, bytes)).toEqual(value)
      await expect(connection.query(["query"], signal(), 1000, bytes - 1)).rejects.toThrow("result-byte")
      connection.check()
    }, (_command, socket) => socket.write(encode(wireFormat, value)), { maxFrameBytes: bytes })
  })

  test("unsolicited replies and unnamed cancellation latch terminal fanout", async () => {
    for (const value of [{ clock: "unsolicited" }, { canceled: true }]) await fixture(wireFormat, async ({ connection, socket }) => {
      const failed: Error[] = []
      connection.listen("a", { push: () => {}, fail: (error) => failed.push(error) })
      connection.listen("b", { push: () => {}, fail: (error) => failed.push(error) })
      socket().write(encode(wireFormat, value))
      await until(() => failed.length === 2)
      expect(() => connection.check()).toThrow()
      expect(failed[0]).toBe(failed[1])
    })
  })

  test("detach is local routing only; it does not unsubscribe or poison siblings", async () => {
    await fixture(wireFormat, async ({ connection, commands, socket }) => {
      const frames: unknown[] = []
      const detach = connection.listen("gone", { push: () => { throw new Error("detached callback") }, fail: () => {} })
      detach()
      connection.listen("alive", { push: (frame) => frames.push(frame), fail: () => {} })
      const pending = connection.command(["clock"], "clock", undefined, signal())
      socket().write(Buffer.concat([
        encode(wireFormat, { subscription: "gone", files: [] }),
        encode(wireFormat, { subscription: "alive", files: [] }), encode(wireFormat, { clock: "c:alive" })
      ]))
      await pending
      expect(frames).toHaveLength(1)
      expect(commands.some((command) => command[0] === "unsubscribe")).toBe(false)
      connection.check()
    })
  })

  // Permanent marker: the human accepted BSER's lossy UTF-8 contract on 2026-10-28.
  test.skipIf(wireFormat === "bser")("fatal UTF-8 contract (BSER permanently skipped: human-accepted lossy codec)", async () => {
    await fixture(wireFormat, async ({ connection }) => {
      await expect(connection.command(["clock"], "clock", undefined, signal())).rejects.toThrow()
      expect(() => connection.check()).toThrow()
    }, (_command, socket) => {
      const frame = encode(wireFormat, { clock: "invalid-byte-marker" })
      frame[frame.indexOf("invalid-byte-marker")] = 255
      socket.write(frame)
    })
  })

  test("logs do not consume a command slot", async () => {
    await fixture(wireFormat, async ({ connection }) => {
      expect((await connection.command(["clock"], "clock", undefined, signal())).clock).toBe("c:reply")
      connection.check()
    }, (_command, socket) => socket.write(Buffer.concat([
      encode(wireFormat, { log: "diagnostic", unilateral: true }), encode(wireFormat, { clock: "c:reply" })
    ])))
  })
})

test("BSER documented degradation: invalid string bytes become U+FFFD, not a terminal error", async () => {
  await fixture("bser", async ({ connection }) => {
    expect((await connection.command(["clock"], "clock", undefined, new AbortController().signal)).clock).toBe("�alid")
    connection.check()
  }, (_command, socket) => {
    const frame = dumpToBuffer({ clock: "valid" })
    frame[frame.indexOf("valid")] = 255
    socket.write(frame)
  })
})

test("BSER template arrays retain absent, null, numeric fields and row order", async () => {
  const payload = (value: unknown) => dumpToBuffer(value).subarray(7)
  const object = Buffer.concat([
    Buffer.from([1, 3, 2]), payload("clock"), payload("c:template"), payload("files"), Buffer.from([11]),
    payload(["name", "type", "size", "mtime_ms"]), Buffer.from([3, 2]),
    payload("z"), payload("f"), payload(null), Buffer.from([12]),
    payload("a"), payload("l"), Buffer.from([12]), payload(0)
  ])
  // dump's v1 int32 header, with the payload replaced by a template fixture.
  const header = dumpToBuffer("x").subarray(0, 7)
  if (endianness() === "LE") header.writeInt32LE(object.length, 3)
  else header.writeInt32BE(object.length, 3)
  await fixture("bser", async ({ connection }) => {
    expect(await connection.query(["query"], new AbortController().signal, 1000, 1000)).toEqual({ clock: "c:template", files: [
      { name: "z", type: "f", size: null }, { name: "a", type: "l", mtime_ms: 0 }
    ] })
  }, (_command, socket) => socket.write(Buffer.concat([header, object])))
})

test("BSER unsafe int64 metadata is exact in the codec and rejects the numeric query schema locally", async () => {
  await fixture("bser", async ({ connection }) => {
    await expect(connection.query(["query"], new AbortController().signal, 1000, 1000)).rejects.toThrow()
    connection.check()
  }, (_command, socket) => socket.write(dumpToBuffer({ clock: "c:bigint", files: [{ name: "big", type: "f", size: 2n ** 60n }] })))
})
