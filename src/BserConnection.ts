/// <reference path="./bser-esm.d.ts" />
import { createConnection, type Socket } from "node:net"
import { dumpToBuffer, loadFromBuffer } from "@superbfowle/bser-esm"
import { Schema } from "effect"
import { ConfigReply, Envelope, QueryReply, Reply, SubscriptionCanceled, type ConnectionOptions, type SubscriptionListener } from "watchman-client-json"
import { BserFraming } from "./BserFraming.js"

const decodeReply = Schema.decodeUnknownSync(Reply)
const decodeEnvelope = Schema.decodeUnknownSync(Envelope)
const decodeQuery = Schema.decodeUnknownSync(QueryReply)
const decodeConfig = Schema.decodeUnknownSync(ConfigReply)

interface Command {
  readonly command: ReadonlyArray<unknown>
  readonly transmitted: () => void
  readonly resolve: (reply: unknown, bytes: number) => void
  readonly reject: (error: Error) => void
}

/** Peer to the JSON client: identical FIFO/cancellation ownership, BSER v1 framing. */
export class BserConnection {
  readonly listeners = new Map<string, SubscriptionListener>()
  private socket: Socket | undefined
  private readonly framing: BserFraming
  private terminal: Error | undefined
  private pending: Command | undefined
  private queue: Array<Command> = []

  constructor(readonly options: ConnectionOptions, readonly onFailure: (error: Error) => void = () => {}) {
    if (!options.socketPath || [options.connectTimeoutMs, options.requestTimeoutMs, options.queueTimeoutMs,
      options.maxFrameBytes, options.maxPendingCommands].some((value) => value !== undefined &&
      (!Number.isSafeInteger(value) || value <= 0))) {
      throw new Error("Watchman socketPath and positive finite integer limits are required")
    }
    this.framing = new BserFraming(options.maxFrameBytes ?? 1024 * 1024)
  }

  get idle(): boolean { return !this.pending && this.queue.length === 0 }

  listen(name: string, listener: SubscriptionListener): () => void {
    this.check()
    this.listeners.set(name, listener)
    return () => { this.listeners.delete(name) }
  }

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
    this.framing.close()
    this.socket?.destroy()
    this.onFailure(error)
  }

  check(): void { if (this.terminal) throw this.terminal }
  close(): void { this.fail(new Error("Watchman connection scope closed")) }

  command(command: ReadonlyArray<unknown>, key: string, value: string | undefined, signal: AbortSignal, timeout = this.options.requestTimeoutMs ?? 3000, queueTimeout = this.options.queueTimeoutMs ?? timeout): Promise<Reply> {
    return this.request(command, signal, timeout, queueTimeout, (input) => {
      const reply = decodeReply(input)
      const decoded = Reflect.get(reply, key)
      if (typeof decoded !== "string" || (value !== undefined && decoded !== value)) throw new Error(`Watchman mismatched ${key} response`)
      return reply
    })
  }

  query(command: ReadonlyArray<unknown>, signal: AbortSignal, timeout: number, maxBytes: number): Promise<QueryReply> {
    return this.request(command, signal, timeout, this.options.queueTimeoutMs ?? timeout, (input, bytes) => {
      if (bytes > maxBytes) throw new Error("Watchman query result-byte budget exceeded")
      const reply = decodeQuery(input)
      if (reply.warning) throw new Error(`Watchman cannot guarantee a complete baseline: ${reply.warning}`)
      return reply
    }, false)
  }

  config(root: string, signal: AbortSignal): Promise<ConfigReply> {
    return this.request(["get-config", root], signal, this.options.requestTimeoutMs ?? 3000, this.options.queueTimeoutMs ?? this.options.requestTimeoutMs ?? 3000,
      (input) => decodeConfig(input))
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
          // The canceled caller does not give up its on-wire reply slot/deadline.
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
    try { this.socket?.write(dumpToBuffer(request.command), (error) => { if (error) this.fail(error) }) }
    catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
  }

  private receive(chunk: Buffer): void {
    if (this.terminal) return
    try {
      this.framing.write(chunk, (frame, bytes) => {
        // Decode one isolated PDU. loadFromBuffer rejects unread trailing data.
        const input = loadFromBuffer(frame)
        const envelope = decodeEnvelope(input)
        if (envelope.canceled) {
          if (!envelope.subscription) { this.fail(new Error("Watchman cancellation omitted subscription")); return false }
          const listener = this.listeners.get(envelope.subscription)
          this.listeners.delete(envelope.subscription)
          listener?.fail(new SubscriptionCanceled("Watchman subscription canceled"))
          return !this.terminal
        }
        if (envelope.subscription) {
          const reply = decodeReply(input)
          this.listeners.get(envelope.subscription)?.push(reply)
          return !this.terminal
        }
        if (envelope.log !== undefined) return !this.terminal
        const pending = this.pending
        if (!pending) { this.fail(new Error("Watchman unsolicited response")); return false }
        if (envelope.error) { this.pending = undefined; pending.reject(new Error(envelope.error)); this.sendNext(); return !this.terminal }
        this.pending = undefined
        pending.resolve(input, bytes)
        this.sendNext()
        return !this.terminal
      })
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
  }
}
