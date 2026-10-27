import { createConnection, type Socket } from "node:net"
import { Schema } from "effect"
import { begin, count, end, measure, retained } from "./Diagnostics.js"

const Reply = Schema.Struct({
  version: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  watch: Schema.optional(Schema.String),
  relative_path: Schema.optional(Schema.String),
  clock: Schema.optional(Schema.String),
  subscribe: Schema.optional(Schema.String),
  unsubscribe: Schema.optional(Schema.String),
  subscription: Schema.optional(Schema.String),
  canceled: Schema.optional(Schema.Boolean),
  is_fresh_instance: Schema.optional(Schema.Boolean),
  files: Schema.optional(Schema.Array(Schema.Struct({
    name: Schema.String, exists: Schema.Boolean, new: Schema.optional(Schema.Boolean),
    type: Schema.optional(Schema.String),
    size: Schema.optional(Schema.NullOr(Schema.Number)),
    mtime_ms: Schema.optional(Schema.NullOr(Schema.Number))
  })))
})
export type Reply = typeof Reply.Type

const Envelope = Schema.Struct({ error: Schema.optional(Schema.String), subscription: Schema.optional(Schema.String), canceled: Schema.optional(Schema.Boolean) })
export const QueryReply = Schema.Struct({
  clock: Schema.String,
  warning: Schema.optional(Schema.String),
  is_fresh_instance: Schema.optional(Schema.Boolean),
  files: Schema.Array(Schema.Union([Schema.String, Schema.Struct({
    name: Schema.String,
    type: Schema.String,
    size: Schema.optional(Schema.NullOr(Schema.Number)),
    mtime_ms: Schema.optional(Schema.NullOr(Schema.Number))
  })]))
})
export type QueryReply = typeof QueryReply.Type
export const ConfigReply = Schema.Struct({ config: Schema.Struct({
  ignore_dirs: Schema.optional(Schema.Array(Schema.String)),
  ignore_vcs: Schema.optional(Schema.Array(Schema.String))
}) })

export interface ConnectionOptions {
  readonly socketPath: string
  readonly connectTimeoutMs?: number
  readonly requestTimeoutMs?: number
  readonly queueTimeoutMs?: number
  readonly cleanupTimeoutMs?: number
  readonly maxFrameBytes?: number
  readonly maxPendingCommands?: number
  readonly maxBufferedEvents?: number
}

export class SubscriptionCanceled extends Error {}

interface Command {
  readonly command: ReadonlyArray<unknown>
  readonly transmitted: () => void
  readonly resolve: (reply: unknown, bytes: number) => void
  readonly reject: (error: Error) => void
}

/** One scoped socket, one outstanding wire command, bounded queued commands. */
export class Connection {
  readonly listeners = new Map<string, { push: (reply: Reply) => void; fail: (error: Error) => void }>()
  private socket: Socket | undefined
  private buffer = Buffer.alloc(0)
  private terminal: Error | undefined
  private pending: Command | undefined
  private queue: Array<Command> = []

  constructor(readonly options: ConnectionOptions, readonly onFailure: (error: Error) => void = () => {}) {}

  get idle(): boolean { return !this.pending && this.queue.length === 0 }

  connect(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ path: this.options.socketPath })
      this.socket = socket
      const timer = setTimeout(() => this.fail(new Error("Watchman connection timeout")), this.options.connectTimeoutMs ?? 3000)
      const abort = () => this.fail(new Error("Watchman connection interrupted"))
      signal.addEventListener("abort", abort, { once: true })
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", abort) }
      socket.once("connect", () => { done(); resolve() })
      socket.once("error", (error) => { done(); reject(error) })
      socket.once("close", () => { done(); reject(this.terminal ?? new Error("Watchman socket closed")) })
      socket.on("error", (error) => this.fail(error))
      socket.on("close", () => this.fail(new Error("Watchman socket closed; reconcile before reopening")))
      socket.on("data", (chunk: Buffer) => this.receive(chunk))
      if (signal.aborted) abort()
    })
  }

  fail(error: Error): void {
    if (this.terminal) return
    this.terminal = error
    this.pending?.reject(error)
    this.pending = undefined
    for (const command of this.queue) command.reject(error)
    this.queue = []
    for (const listener of this.listeners.values()) listener.fail(error)
    this.listeners.clear()
    this.buffer = Buffer.alloc(0)
    this.socket?.destroy()
    this.onFailure(error)
  }

  check(): void { if (this.terminal) throw this.terminal }
  close(): void { this.fail(new Error("Watchman connection scope closed")) }

  command(command: ReadonlyArray<unknown>, key: string, value: string | undefined, signal: AbortSignal, timeout = this.options.requestTimeoutMs ?? 3000, queueTimeout = this.options.queueTimeoutMs ?? timeout): Promise<Reply> {
    return this.request(command, signal, timeout, queueTimeout, (input) => {
      const start = begin()
      const reply = Schema.decodeUnknownSync(Reply)(input)
      end("schema", start, 0, reply.files?.length ?? 0)
      const decoded = Reflect.get(reply, key)
      if (typeof decoded !== "string" || (value !== undefined && decoded !== value)) throw new Error(`Watchman mismatched ${key} response`)
      return reply
    })
  }

  query(command: ReadonlyArray<unknown>, signal: AbortSignal, timeout: number, maxBytes: number): Promise<QueryReply> {
    return this.request(command, signal, timeout, this.options.queueTimeoutMs ?? timeout, (input, bytes) => {
      if (bytes > maxBytes) throw new Error("Watchman query result-byte budget exceeded")
      const start = begin()
      const reply = Schema.decodeUnknownSync(QueryReply)(input)
      end("schema", start, bytes, reply.files.length)
      if (reply.warning) throw new Error(`Watchman cannot guarantee a complete baseline: ${reply.warning}`)
      return reply
    }, false)
  }

  config(root: string, signal: AbortSignal): Promise<typeof ConfigReply.Type> {
    return this.request(["get-config", root], signal, this.options.requestTimeoutMs ?? 3000, this.options.queueTimeoutMs ?? this.options.requestTimeoutMs ?? 3000,
      (input) => Schema.decodeUnknownSync(ConfigReply)(input))
  }

  private request<A>(command: ReadonlyArray<unknown>, signal: AbortSignal, timeout: number, queueTimeout: number,
    decode: (input: unknown, bytes: number) => A, terminalDecode = true): Promise<A> {
    if (signal.aborted) return Promise.reject(new Error("Watchman command interrupted before transmission"))
    if (this.terminal) return Promise.reject(this.terminal)
    if (this.queue.length + (this.pending ? 1 : 0) >= (this.options.maxPendingCommands ?? 128)) {
      this.fail(new Error("Watchman command queue overflow"))
      return Promise.reject(this.terminal)
    }
    return new Promise<A>((resolve, reject) => {
      let timer = setTimeout(() => this.fail(new Error("Watchman request timeout")), queueTimeout)
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort) }
      const request: Command = {
        command,
        transmitted: () => {
          clearTimeout(timer)
          timer = setTimeout(() => this.fail(new Error("Watchman request timeout")), timeout)
        },
        resolve: (reply, bytes) => {
          cleanup()
          try { resolve(decode(reply, bytes)) }
          catch (error) {
            const cause = error instanceof Error ? error : new Error(String(error))
            reject(cause)
            if (terminalDecode) this.fail(cause)
          }
        },
        reject: (error) => { cleanup(); reject(error) }
      }
      const abort = () => {
        const error = new Error("Watchman command caller interrupted")
        if (this.pending === request) {
          // Abandon only the caller. Retain wire ownership/deadline until the
          // reply settles, so a late subscribe can be followed by unsubscribe.
          signal.removeEventListener("abort", abort)
          reject(error)
          return
        }
        this.queue = this.queue.filter((queued) => queued !== request)
        request.reject(error)
      }
      signal.addEventListener("abort", abort, { once: true })
      this.queue.push(request)
      this.sendNext()
    })
  }

  private sendNext(): void {
    if (this.terminal || this.pending) return
    const request = this.queue.shift()
    if (!request) return
    this.pending = request
    request.transmitted()
    this.socket?.write(JSON.stringify(request.command) + "\n", (error) => { if (error) this.fail(error) })
  }

  private receive(chunk: Buffer): void {
    if (this.terminal) return
    const receive = begin()
    try {
    count("receivedBytes", chunk.length)
    this.buffer = measure("copy", () => Buffer.concat([this.buffer, chunk]), this.buffer.length + chunk.length)
    count("copiedBytes", this.buffer.length)
    retained(this.buffer.length, 1)
    const limit = this.options.maxFrameBytes ?? 1024 * 1024
    while (!this.terminal) {
      const newline = measure("framing", () => this.buffer.indexOf(10), this.buffer.length)
      count("scannedBytes", newline < 0 ? this.buffer.length : newline + 1)
      if (newline < 0) { if (this.buffer.length > limit) this.fail(new Error("Watchman frame overflow")); return }
      if (newline > limit) { this.fail(new Error("Watchman frame overflow")); return }
      const bytes = this.buffer.subarray(0, newline)
      this.buffer = this.buffer.subarray(newline + 1)
      count("frames", 1)
      try {
        const frame = measure("utf8", () => new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes.length)
        const input = measure("json", () => Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(frame), bytes.length)
        const envelope = measure("envelope", () => Schema.decodeUnknownSync(Envelope)(input), bytes.length)
        // Cancellation must win over ordinary unilateral subscription delivery.
        if (envelope.canceled) {
          if (!envelope.subscription) { this.fail(new Error("Watchman cancellation omitted subscription")); return }
          const listener = this.listeners.get(envelope.subscription)
          this.listeners.delete(envelope.subscription)
          listener?.fail(new SubscriptionCanceled("Watchman subscription canceled"))
          continue
        }
        if (envelope.subscription) {
          const start = begin()
          const reply = Schema.decodeUnknownSync(Reply)(input)
          end("schema", start, bytes.length, reply.files?.length ?? 0)
          this.listeners.get(envelope.subscription)?.push(reply)
          continue
        }
        const pending = this.pending
        if (!pending) { this.fail(new Error("Watchman unsolicited response")); return }
        if (envelope.error) { this.pending = undefined; pending.reject(new Error(envelope.error)); this.sendNext(); continue }
        this.pending = undefined
        pending.resolve(input, bytes.length)
        this.sendNext()
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
    }
    } finally { end("receive", receive, chunk.length) }
  }
}

/** Bounded delivery with a latched terminal error, never a dropped loss hint. */
export class Delivery<A> implements AsyncIterable<A> {
  private values: Array<A> = []
  private error: Error | undefined
  private waiter: { resolve: (value: IteratorResult<A>) => void; reject: (error: Error) => void } | undefined
  constructor(readonly capacity: number) {}
  push(value: A): void {
    if (this.error) return
    if (this.waiter) { this.waiter.resolve({ done: false, value }); this.waiter = undefined; return }
    if (this.values.length >= this.capacity) { this.fail(new Error("Watchman delivery overflow; reconcile before reopening")); return }
    this.values.push(value)
  }
  fail(error: Error): void {
    if (this.error) return
    this.error = error
    this.values = []
    this.waiter?.reject(error)
    this.waiter = undefined
  }
  [Symbol.asyncIterator](): AsyncIterator<A> {
    return { next: () => {
      if (this.error) return Promise.reject(this.error)
      const value = this.values.shift()
      if (value !== undefined) return Promise.resolve({ done: false, value })
      return new Promise((resolve, reject) => { this.waiter = { resolve, reject } })
    }, return: () => { this.fail(new Error("Watchman delivery closed")); return Promise.resolve({ done: true, value: undefined }) } }
  }
}
