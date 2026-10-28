import { endianness } from "node:os"

const bigEndian = endianness() === "BE"

/** BSER v1 only: fixed 11-byte header scratch, one bounded owned PDU at a time. */
export class BserFraming {
  readonly header = Buffer.allocUnsafeSlow(11)
  private used = 0
  private headerBytes = 3
  private frame: Buffer | undefined
  private filled = 0
  private closed = false
  constructor(readonly limit: number) {}

  get retainedBytes() { return this.frame?.length ?? 0 }

  write(chunk: Buffer, push: (frame: Buffer, payloadBytes: number) => boolean): void {
    let offset = 0
    while (offset < chunk.length && !this.closed) {
      if (!this.frame) {
        const length = Math.min(this.headerBytes - this.used, chunk.length - offset)
        chunk.copy(this.header, this.used, offset, offset + length)
        this.used += length
        offset += length
        if (this.used < this.headerBytes) return
        if (this.header[0] !== 0 || this.header[1] !== 1) this.invalid("invalid BSER v1 header")
        const tag = this.header[2]
        if (tag === undefined || tag < 3 || tag > 6) this.invalid("invalid BSER length tag")
        this.headerBytes = 3 + 2 ** (tag - 3)
        if (this.used < this.headerBytes) continue
        const bytes = this.payloadLength(tag)
        if (bytes <= 0n) this.invalid("invalid BSER payload length")
        if (bytes > BigInt(this.limit)) this.invalid("frame overflow")
        this.frame = Buffer.allocUnsafeSlow(this.headerBytes + Number(bytes))
        this.header.copy(this.frame, 0, 0, this.headerBytes)
        this.filled = this.headerBytes
      }
      const frame = this.frame
      const length = Math.min(frame.length - this.filled, chunk.length - offset)
      chunk.copy(frame, this.filled, offset, offset + length)
      this.filled += length
      offset += length
      if (this.filled < frame.length) return
      const payloadBytes = frame.length - this.headerBytes
      this.clear()
      if (!push(frame, payloadBytes)) this.close()
    }
  }

  close(): void { this.closed = true; this.clear() }

  private payloadLength(tag: number): bigint {
    if (tag === 3) return BigInt(this.header.readInt8(3))
    if (tag === 4) return BigInt(bigEndian ? this.header.readInt16BE(3) : this.header.readInt16LE(3))
    if (tag === 5) return BigInt(bigEndian ? this.header.readInt32BE(3) : this.header.readInt32LE(3))
    return bigEndian ? this.header.readBigInt64BE(3) : this.header.readBigInt64LE(3)
  }
  private invalid(message: string): never { this.close(); throw new Error(`Watchman ${message}`) }
  private clear(): void { this.used = 0; this.headerBytes = 3; this.frame = undefined; this.filled = 0 }
}
