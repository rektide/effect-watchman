import { realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { Effect, PlatformError } from "effect"
import { Connection, type ConnectionOptions, type Reply } from "./Connection.js"

export type Options = ConnectionOptions & {
  readonly defaultIgnores?: boolean | undefined
  readonly approvedRoots?: ReadonlyArray<string> | undefined
}
export const failure = (cause: unknown) => PlatformError.systemError({
  module: "Watchman", method: "watch/query", _tag: "Unknown", description: String(cause), cause
})
export const badArgument = (description: string) => PlatformError.badArgument({ module: "Watchman", method: "enumerate", description })
export const contains = (root: string, target: string) => {
  const name = relative(root, target)
  return name !== ".." && !name.startsWith(".." + sep) && !isAbsolute(name)
}

/** Internal owner shared by both projections; never a public transport service. */
export const makeOwner = (options: Options) => Effect.gen(function*() {
  if (!options.socketPath || Object.entries(options).some(([key, value]) => !["socketPath", "defaultIgnores", "approvedRoots"].includes(key) && value !== undefined &&
    (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0))) {
    return yield* Effect.fail(badArgument("socketPath and positive finite integer limits are required"))
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
  const connection = yield* Effect.acquireRelease(Effect.sync(() => new Connection(options)), (connection) => Effect.sync(() => connection.close()))
  yield* Effect.tryPromise({ try: (signal) => connection.connect(signal), catch: failure })
  const roots = new Map<string, Promise<Reply>>()
  const projectSignal = new AbortController().signal
  let serial = 0
  return {
    connection, options,
    nextName: () => `effect-watchman-${++serial}`,
    scope: (target: string) => Effect.tryPromise({ try: async () => {
      connection.check()
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
    command: (args: ReadonlyArray<unknown>, key: string, value?: string, timeout?: number, queueTimeout?: number) => Effect.tryPromise({
      try: (signal) => connection.command(args, key, value, signal, timeout,
        queueTimeout === undefined ? undefined : Math.max(queueTimeout, options.queueTimeoutMs ?? 0)), catch: failure
    }),
    project: (target: string) => Effect.tryPromise({ try: async () => {
      const canonical = await realpath(resolve(target))
      // With an approval boundary, acquire the exact approved root. Never call
      // watch-project then discover it has already acquired a broader watch.
      const root = approved?.filter((root) => contains(root, canonical)).sort((a, b) => b.length - a.length)[0]
      if (approved && !root) throw new Error("Target is outside approved Watchman acquisition roots")
      const acquisition = root ?? canonical
      connection.check()
      const cached = roots.get(acquisition)
      if (cached) return { reply: await cached, canonical }
      const acquired = connection.command([approved ? "watch" : "watch-project", acquisition], "watch", undefined, projectSignal)
      roots.set(acquisition, acquired)
      acquired.catch(() => roots.delete(acquisition))
      return { reply: await acquired, canonical }
    }, catch: failure }),
    config: (root: string) => Effect.tryPromise({ try: (signal) => {
      connection.check()
      return connection.config(root, signal)
    }, catch: failure })
  }
})

export type Owner = Effect.Success<ReturnType<typeof makeOwner>>
