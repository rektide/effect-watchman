import { realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { Clock, Effect, PlatformError, Queue, Random } from "effect"
import { Connection, type ConnectionOptions, type Reply } from "./Connection.js"

export interface RecoveryOptions {
  readonly retryMinMs?: number
  readonly retryMaxMs?: number
  readonly stableHealthMs?: number
  readonly probeIntervalMs?: number
  readonly probeTimeoutMs?: number
}
export type Options = ConnectionOptions & RecoveryOptions & {
  readonly defaultIgnores?: boolean | undefined
  readonly approvedRoots?: ReadonlyArray<string> | undefined
}
export interface Health {
  readonly state: "healthy" | "recovering" | "closed"
  readonly generation: number
  readonly interests: number
  readonly attempts: number
  readonly reason?: string | undefined
}
export interface Session {
  readonly generation: number
  readonly connection: Connection
  readonly roots: Map<string, Promise<Reply>>
  readonly abort: AbortController
}
interface Interest {
  readonly attach: (session: Session, signal: AbortSignal) => Promise<void>
  readonly fail: (error: Error) => void
}
export const failure = (cause: unknown) => PlatformError.systemError({
  module: "Watchman", method: "watch/query", _tag: "Unknown", description: String(cause), cause
})
export const badArgument = (description: string) => PlatformError.badArgument({ module: "Watchman", method: "enumerate", description })
export const contains = (root: string, target: string) => {
  const name = relative(root, target)
  return name !== ".." && !name.startsWith(".." + sep) && !isAbsolute(name)
}

/** One scoped recovery/probe controller shared by watch and query projections. */
export const makeOwner = (options: Options) => Effect.gen(function*() {
  if (!options.socketPath || Object.entries(options).some(([key, value]) => !["socketPath", "defaultIgnores", "approvedRoots"].includes(key) && value !== undefined &&
    (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) || (options.retryMinMs ?? 250) > (options.retryMaxMs ?? 60_000)) {
    return yield* Effect.fail(badArgument("socketPath and positive finite integer limits (retryMinMs <= retryMaxMs) are required"))
  }
  const approval = options.approvedRoots
  const approved = approval === undefined ? undefined : yield* Effect.tryPromise({
    try: () => Promise.all(approval.map(async (root) => {
      if (!isAbsolute(root)) throw new Error("approvedRoots must be absolute directories")
      const canonical = await realpath(root)
      if (!(await stat(canonical)).isDirectory()) throw new Error("approvedRoots must be directories")
      return canonical
    })), catch: failure
  })
  const wake = yield* Queue.sliding<void>(1)
  const clock = yield* Clock.Clock
  const interests = new Map<Interest, { abort: AbortController; generation: number; revision: number }>()
  let active: Session | undefined
  let candidate: Connection | undefined
  let generation = 0
  let attempts = 0
  let reason: string | undefined
  let state: Health["state"] = "recovering"
  let healthySince = 0
  let outage = false
  let closed = false
  let serial = 0
  const current = () => {
    if (!active) throw new Error(reason ?? "Watchman owner is recovering")
    active.connection.check()
    return active
  }
  yield* Effect.addFinalizer(() => Effect.sync(() => {
    closed = true
    state = "closed"
    interests.forEach((slot, interest) => { slot.abort.abort(); interest.fail(new Error("Watchman owner scope closed")) })
    interests.clear()
    active?.abort.abort()
    active?.connection.close()
    candidate?.close()
    active = undefined
  }))
  const connect = Effect.gen(function*() {
    const connection = new Connection(options, (error) => {
      if (closed || active?.connection !== connection) return
      if (state === "healthy" && clock.currentTimeMillisUnsafe() - healthySince >= (options.stableHealthMs ?? 30_000)) attempts = 0
      active.abort.abort()
      active = undefined
      state = "recovering"
      reason = error.message
      Queue.offerUnsafe(wake, undefined)
    })
    candidate = connection
    const result = yield* Effect.tryPromise({ try: (signal) => connection.connect(signal), catch: (error) => error }).pipe(
      Effect.andThen(Effect.try({ try: () => connection.check(), catch: (error) => error })), Effect.result
    )
    candidate = undefined
    if (result._tag === "Failure") {
      connection.close()
      reason = String(result.failure)
      return false
    }
    active = { connection, generation: ++generation, roots: new Map(), abort: new AbortController() }
    return true
  })
  // Preserve bounded startup acquisition, but a missing daemon leaves a usable
  // degraded owner. Ordinary operations fail; opted-in signals await attachment.
  yield* connect
  yield* Effect.gen(function*() {
    while (!closed) {
      if (!active) {
        if (!outage) {
          outage = true
          yield* Effect.logWarning("Watchman owner unavailable", { generation, interests: interests.size, reason })
        }
        const ceiling = Math.min(options.retryMaxMs ?? 60_000, (options.retryMinMs ?? 250) * 2 ** Math.min(attempts, 30))
        const jitter = yield* Random.next
        attempts++
        yield* Effect.sleep(Math.max(1, Math.floor(ceiling * (0.5 + jitter * 0.5))))
        yield* Effect.logDebug("Watchman reconnect attempt", { attempts })
        if (!(yield* connect)) continue
      }
      const session = active
      if (!session) continue
      // Serial restoration bounds aggregate command pressure independently of
      // interest count and shares this controller with idle liveness probing.
      for (const [interest, slot] of interests) {
        if (active !== session) break
        if (slot.generation === session.generation) continue
        const revision = slot.revision
        const result = yield* Effect.tryPromise({
          try: (signal) => interest.attach(session, AbortSignal.any([signal, slot.abort.signal])),
          catch: (error) => error instanceof Error ? error : new Error(String(error))
        }).pipe(Effect.result)
        if (!interests.has(interest)) continue
        if (active !== session) break
        if (result._tag === "Failure") {
          interests.delete(interest)
          interest.fail(result.failure)
          continue
        }
        slot.generation = revision === slot.revision ? session.generation : 0
        if (slot.generation === 0) Queue.offerUnsafe(wake, undefined)
      }
      if (active !== session) continue
      if (state !== "healthy") healthySince = yield* Clock.currentTimeMillis
      state = "healthy"
      reason = undefined
      if (outage) {
        outage = false
        yield* Effect.logInfo("Watchman owner recovered", { generation, interests: interests.size, attempts })
      }
      if ((yield* Clock.currentTimeMillis) - healthySince >= (options.stableHealthMs ?? 30_000)) attempts = 0
      const probe = yield* Effect.raceFirst(Queue.take(wake).pipe(Effect.as(false)), Effect.sleep(options.probeIntervalMs ?? 30_000).pipe(Effect.as(true)))
      if (!probe || active !== session || !session.connection.idle) continue
      // A busy wire already has a deadline; do not truncate a legitimate long
      // enumeration by queuing a short-deadline probe behind it.
      yield* Effect.tryPromise({
        try: (signal) => session.connection.command(["version"], "version", undefined, signal,
          options.probeTimeoutMs ?? options.requestTimeoutMs ?? 3000), catch: failure
      }).pipe(Effect.ignore)
    }
  }).pipe(Effect.forkScoped({ startImmediately: true }))
  return {
    options,
    get connection() { return current().connection },
    health: () => Effect.sync((): Health => ({ state, generation, interests: interests.size, attempts, reason })),
    nextName: () => `effect-watchman-${++serial}`,
    retain: (interest: Interest) => {
      if (closed) { interest.fail(new Error("Watchman owner scope closed")); return () => {} }
      const slot = { abort: new AbortController(), generation: 0, revision: 0 }
      interests.set(interest, slot)
      Queue.offerUnsafe(wake, undefined)
      return () => { interests.delete(interest); slot.abort.abort() }
    },
    refresh: (interest: Interest) => {
      const slot = interests.get(interest)
      if (!slot) return
      slot.revision++
      slot.generation = 0
      Queue.offerUnsafe(wake, undefined)
    },
    scope: (target: string) => Effect.tryPromise({ try: async () => {
      current()
      if (!approved || !approval) throw new Error("Enumeration requires approved roots")
      const logical = resolve(target)
      const lexical = [...approval, ...approved].some((root) => contains(resolve(root), logical))
      const canonical = await realpath(logical).catch((error: NodeJS.ErrnoException) => {
        if (lexical && (error.code === "ENOENT" || error.code === "ENOTDIR")) return undefined
        throw error
      })
      if (canonical === undefined) return "missing" as const
      const covered = approved.some((root) => contains(root, canonical))
      if (!lexical && !covered) throw new Error("Target is outside approved Watchman acquisition roots")
      if (!(await stat(logical)).isDirectory()) return "missing" as const
      return covered ? "daemon" as const : "local" as const
    }, catch: failure }),
    command: (args: ReadonlyArray<unknown>, key: string, value?: string, timeout?: number, queueTimeout?: number, session?: Session) => Effect.tryPromise({
      try: (signal) => (session ?? current()).connection.command(args, key, value, signal, timeout,
        queueTimeout === undefined ? undefined : Math.max(queueTimeout, options.queueTimeoutMs ?? 0)), catch: failure
    }),
    project: (target: string, expected?: Session) => Effect.tryPromise({ try: async () => {
      const session = expected ?? current()
      const canonical = await realpath(resolve(target))
      if (!(await stat(canonical)).isDirectory()) throw new Error("Query target must be a directory")
      const root = approved?.filter((root) => contains(root, canonical)).sort((a, b) => b.length - a.length)[0]
      if (approved && !root) throw new Error("Target is outside approved Watchman acquisition roots")
      const acquisition = root ?? canonical
      session.connection.check()
      const cached = session.roots.get(acquisition)
      if (cached) return { reply: await cached, canonical, session }
      const acquired = session.connection.command([approved ? "watch" : "watch-project", acquisition], "watch", undefined, session.abort.signal)
      session.roots.set(acquisition, acquired)
      acquired.catch(() => session.roots.delete(acquisition))
      return { reply: await acquired, canonical, session }
    }, catch: failure }),
    config: (root: string, session?: Session) => Effect.tryPromise({
      try: (signal) => (session ?? current()).connection.config(root, signal), catch: failure
    })
  }
})

export type Owner = Effect.Success<ReturnType<typeof makeOwner>>
