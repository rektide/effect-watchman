declare module "@superbfowle/bser-esm" {
  import { EventEmitter } from "node:events"
  export function dumpToBuffer(value: unknown): Buffer
  export function loadFromBuffer(input: Buffer): unknown
  export class BunserBuf extends EventEmitter {
    append(input: Buffer, synchronous?: boolean): unknown
  }
}
