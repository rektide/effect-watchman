import { expect, test } from "bun:test"
import { endianness } from "node:os"
import { dumpToBuffer, loadFromBuffer } from "@superbfowle/bser-esm"
import { BserFraming } from "../src/BserFraming.ts"

const payload = dumpToBuffer({ clock: "c:1", files: [{ name: "café/😀\nname", type: "f" }] }).subarray(7)
const header = (size: bigint, width: number) => {
  const result = Buffer.alloc(3 + width)
  result[1] = 1
  result[2] = 3 + Math.log2(width)
  if (width === 1) result.writeInt8(Number(size), 3)
  if (width === 2) endianness() === "BE" ? result.writeInt16BE(Number(size), 3) : result.writeInt16LE(Number(size), 3)
  if (width === 4) endianness() === "BE" ? result.writeInt32BE(Number(size), 3) : result.writeInt32LE(Number(size), 3)
  if (width === 8) endianness() === "BE" ? result.writeBigInt64BE(size, 3) : result.writeBigInt64LE(size, 3)
  return result
}

test.each([1, 2, 4, 8])("BSER %i-byte length, every header/payload split, exact payload limit", (width) => {
  const wire = Buffer.concat([header(BigInt(payload.length), width), payload])
  for (let split = 0; split <= wire.length; split++) {
    const framing = new BserFraming(payload.length)
    const values: unknown[] = []
    const push = (frame: Buffer, bytes: number) => {
      expect(bytes).toBe(payload.length)
      values.push(loadFromBuffer(frame))
      return true
    }
    framing.write(wire.subarray(0, split), push)
    expect(framing.retainedBytes).toBeLessThanOrEqual(payload.length + 11)
    framing.write(wire.subarray(split), push)
    expect(values).toEqual([loadFromBuffer(dumpToBuffer({ clock: "c:1", files: [{ name: "café/😀\nname", type: "f" }] }))])
    expect(framing.retainedBytes).toBe(0)
  }
})

test("one-byte fragments, many PDUs in one chunk and tiny leftover preserve order and bounds", () => {
  const frame = dumpToBuffer({ clock: "c:1" })
  const framing = new BserFraming(frame.length - 7)
  const values: unknown[] = []
  const push = (bytes: Buffer) => { values.push(loadFromBuffer(bytes)); return true }
  for (const byte of frame) framing.write(Buffer.from([byte]), push)
  framing.write(Buffer.concat([frame, frame, frame.subarray(0, 1)]), push)
  expect(values).toEqual(Array.from({ length: 3 }, () => ({ clock: "c:1" })))
  expect(framing.retainedBytes).toBe(0) // One prefix byte is in fixed 11-byte scratch.
  expect(framing.header.length).toBe(11)
  framing.write(frame.subarray(1), push)
  expect(values).toHaveLength(4)
})

test("oversized/negative/unsafe lengths reject from the bounded header before payload allocation", () => {
  for (const size of [-1n, 0n, 33n, 2n ** 60n]) {
    const framing = new BserFraming(32)
    const wire = header(size, 8)
    framing.write(wire.subarray(0, wire.length - 1), () => true)
    expect(framing.retainedBytes).toBe(0)
    expect(() => framing.write(wire.subarray(-1), () => true)).toThrow()
    expect(framing.retainedBytes).toBe(0)
    framing.write(dumpToBuffer({ clock: "must-not-deliver" }), () => { throw new Error("delivered after failure") })
  }
})

test("unfinished payload retains only one bounded PDU and close releases it", () => {
  const framing = new BserFraming(32)
  framing.write(Buffer.concat([header(32n, 4), Buffer.alloc(31)]), () => { throw new Error("partial delivery") })
  expect(framing.retainedBytes).toBe(39)
  framing.close()
  expect(framing.retainedBytes).toBe(0)
})

test("invalid magic, v2 and non-integer tags fail; terminal callbacks stop same-chunk delivery", () => {
  for (const bytes of [[1, 1, 3], [0, 2, 3], [0, 1, 2], [0, 1, 7]]) {
    expect(() => new BserFraming(32).write(Buffer.from(bytes), () => true)).toThrow()
  }
  const frame = dumpToBuffer({ clock: "c:1" })
  const framing = new BserFraming(32)
  let delivered = 0
  framing.write(Buffer.concat([frame, frame]), () => { delivered++; return false })
  expect(delivered).toBe(1)
  expect(framing.retainedBytes).toBe(0)
})
