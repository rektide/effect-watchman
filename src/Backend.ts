import { realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { Effect, FileSystem, Layer, Option, PlatformError, Stream } from "effect"
import { Connection, Delivery, type ConnectionOptions, type Reply } from "./Connection.js"

export type Options = ConnectionOptions
const failure = (cause: unknown) => PlatformError.systemError({
  module: "Watchman", method: "watch", _tag: "Unknown", description: String(cause), cause
})

export const backendLayer = (options: Options) => Layer.effect(FileSystem.WatchBackend, Effect.gen(function*() {
  if (!options.socketPath || Object.entries(options).some(([key, value]) => key !== "socketPath" && value !== undefined &&
    (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0))) {
    return yield* Effect.fail(PlatformError.badArgument({ module: "Watchman", method: "backendLayer", description: "socketPath and positive finite integer limits are required" }))
  }
  const connection = yield* Effect.acquireRelease(Effect.sync(() => new Connection(options)), (connection) => Effect.sync(() => connection.close()))
  yield* Effect.tryPromise({ try: (signal) => connection.connect(signal), catch: failure })
  const roots = new Map<string, Promise<Reply>>()
  let serial = 0
  return FileSystem.WatchBackend.of({
    register(target, info, watchOptions) {
      return Option.some(Stream.unwrap(Effect.gen(function*() {
        const logical = resolve(info.type === "Directory" ? target : dirname(target))
        const canonical = yield* Effect.tryPromise({ try: () => realpath(logical), catch: failure })
        const command = (args: ReadonlyArray<unknown>, key: string, value?: string, timeout?: number) => Effect.tryPromise({
          try: (signal) => connection.command(args, key, value, signal, timeout), catch: failure
        })
        const project = yield* Effect.tryPromise({ try: (signal) => {
          connection.check()
          const cached = roots.get(canonical)
          if (cached) return cached
          const acquired = connection.command(["watch-project", canonical], "watch", undefined, signal)
          roots.set(canonical, acquired)
          acquired.catch(() => roots.delete(canonical))
          return acquired
        }, catch: failure })
        const root = project.watch
        if (!root) return yield* Effect.fail(failure("Watchman watch-project omitted root"))
        const boundary = yield* command(["clock", root], "clock")
        const name = `effect-watchman-${++serial}`
        const delivery = new Delivery<FileSystem.WatchEvent>(options.maxBufferedEvents ?? 1024)
        yield* Effect.acquireRelease(Effect.try({ try: () => {
          connection.check()
          connection.listeners.set(name, {
            fail: (error) => delivery.fail(error),
            push: (reply) => {
              if (reply.is_fresh_instance) { delivery.fail(new Error("Watchman fresh history; reconcile before reopening")); return }
              for (const file of reply.files ?? []) {
                const local = file.name
                if (isAbsolute(local) || local === ".." || local.startsWith("../")) { delivery.fail(new Error("Watchman escaping path")); return }
                if (local.split("/").some((part) => part.startsWith(".watchman-cookie-"))) continue
                if (info.type !== "Directory" && local !== basename(target)) continue
                if (info.type === "Directory" && !watchOptions?.recursive && local.includes("/")) continue
                delivery.push({ _tag: !file.exists ? "Remove" : file.new ? "Create" : "Update", path: resolve(logical, local) })
              }
            }
          })
        }, catch: failure }), () => Effect.gen(function*() {
          connection.listeners.delete(name)
          delivery.fail(new Error("Watchman subscription scope closed"))
          yield* command(["unsubscribe", root, name], "unsubscribe", name, options.cleanupTimeoutMs ?? 500).pipe(Effect.ignore)
        }))
        const relativeRoot = relative(root, canonical)
        if (relativeRoot === ".." || relativeRoot.startsWith(".." + sep)) return yield* Effect.fail(failure("Watchman root does not contain target"))
        yield* command(["subscribe", root, name, {
          since: boundary.clock, fields: ["name", "exists", "new"],
          ...(relativeRoot ? { relative_root: relativeRoot } : {})
        }], "subscribe", name)
        return Stream.fromAsyncIterable(delivery, failure)
      })))
    }
  })
}))
