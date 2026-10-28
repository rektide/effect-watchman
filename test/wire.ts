import type { Socket } from "node:net"
import { BunserBuf, dumpToBuffer } from "@superbfowle/bser-esm"

export type WireFormat = "json" | "bser"

export const encode = (wireFormat: WireFormat, value: unknown): Buffer => wireFormat === "bser"
  ? dumpToBuffer(value) : Buffer.from(JSON.stringify(value) + "\n")

/** Fixture-side streaming codec, independent of the production BSER framer. */
export function readFrames(wireFormat: WireFormat, socket: Socket, push: (input: unknown) => void): void {
  if (wireFormat === "bser") {
    const decoder = new BunserBuf()
    decoder.on("value", push)
    decoder.on("error", (error: Error) => { throw error })
    socket.on("data", (chunk: Buffer) => decoder.append(chunk))
    return
  }
  let buffer = ""
  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n")
      const frame: unknown = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      push(frame)
    }
  })
}

export function readCommands(wireFormat: WireFormat, socket: Socket, push: (command: ReadonlyArray<unknown>) => void): void {
  readFrames(wireFormat, socket, (input) => {
    if (!Array.isArray(input)) throw new Error("Scripted peer expected a command array")
    push(input)
  })
}
