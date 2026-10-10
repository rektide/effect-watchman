import { createConnection, type Socket } from "node:net"
import { Schema } from "effect"

const Reply = Schema.Struct({
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
    name: Schema.String, exists: Schema.Boolean, new: Schema.optional(Schema.Boolean)
  })))
})
export type Reply = typeof Reply.Type

export interface ConnectionOptions {
  readonly socketPath: string
  readonly connectTimeoutMs?: number
  readonly requestTimeoutMs?: number
  readonly cleanupTimeoutMs?: number
  readonly maxFrameBytes?: number
  readonly maxPendingCommands?: number
  readonly maxBufferedEvents?: number
}

interface Command {
  readonly command: ReadonlyArray<unknown>
  readonly key: string
  readonly value: string | undefined
  readonly transmitted: () => void
  readonly resolve: (reply: Reply) => void
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

  constructor(readonly options: ConnectionOptions) {}

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
  }

  check(): void { if (this.terminal) throw this.terminal }
  close(): void { this.fail(new Error("Watchman connection scope closed")) }

  command(command: ReadonlyArray<unknown>, key: string, value: string | undefined, signal: AbortSignal, timeout = this.options.requestTimeoutMs ?? 3000, queueTimeout = timeout): Promise<Reply> {
    if (signal.aborted) return Promise.reject(new Error("Watchman command interrupted before transmission"))
    if (this.terminal) return Promise.reject(this.terminal)
    if (this.queue.length + (this.pending ? 1 : 0) >= (this.options.maxPendingCommands ?? 128)) {
      this.fail(new Error("Watchman command queue overflow"))
      return Promise.reject(this.terminal)
    }
    return new Promise<Reply>((resolve, reject) => {
      let timer = setTimeout(() => this.fail(new Error("Watchman request timeout")), queueTimeout)
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort) }
      const request: Command = {
        command, key, value,
        transmitted: () => {
          if (queueTimeout === timeout) return
          clearTimeout(timer)
          timer = setTimeout(() => this.fail(new Error("Watchman request timeout")), timeout)
        },
        resolve: (reply) => { cleanup(); resolve(reply) },
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
    this.buffer = Buffer.concat([this.buffer, chunk])
    const limit = this.options.maxFrameBytes ?? 1024 * 1024
    while (!this.terminal) {
      const end = this.buffer.indexOf(10)
      if (end < 0) { if (this.buffer.length > limit) this.fail(new Error("Watchman frame overflow")); return }
      if (end > limit) { this.fail(new Error("Watchman frame overflow")); return }
      const bytes = this.buffer.subarray(0, end)
      this.buffer = this.buffer.subarray(end + 1)
      try {
        const frame = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        const reply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(frame)
        // Cancellation must win over ordinary unilateral subscription delivery.
        if (reply.canceled) { this.fail(new Error("Watchman subscription canceled")); return }
        if (reply.subscription) {
          this.listeners.get(reply.subscription)?.push(reply)
          continue
        }
        const pending = this.pending
        if (!pending) { this.fail(new Error("Watchman unsolicited response")); return }
        if (reply.error) { this.pending = undefined; pending.reject(new Error(reply.error)); this.sendNext(); continue }
        const decoded = Reflect.get(reply, pending.key)
        if (typeof decoded !== "string" || (pending.value !== undefined && decoded !== pending.value)) {
          this.fail(new Error(`Watchman mismatched ${pending.key} response`)); return
        }
        this.pending = undefined
        pending.resolve(reply)
        this.sendNext()
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
    }
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
