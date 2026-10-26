import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { Effect, FileSystem, Layer, Option, Stream } from "effect"
import { Delivery } from "./Connection.js"
import { failure, makeOwner, type Owner } from "./Owner.js"
import { Recovery } from "./Recovery.js"
import { makeSignalBackend } from "./SignalBackend.js"

export type { Options } from "./Owner.js"
import type { Options } from "./Owner.js"

export const backendLayer = (options: Options) => Layer.effect(FileSystem.WatchBackend, Effect.map(makeOwner(options), makeBackend))

export function makeBackend(owner: Owner): Recovery.Backend {
  const { options } = owner
  return {
    [Recovery.BackendTypeId]: makeSignalBackend(owner),
    register(target, info, watchOptions) {
      return Option.some(Stream.unwrap(Effect.gen(function*() {
        const logical = resolve(info.type === "Directory" ? target : dirname(target))
         const project = yield* owner.project(logical)
         const connection = project.session.connection
         const command = (args: ReadonlyArray<unknown>, key: string, value?: string, timeout?: number, queueTimeout?: number) =>
           owner.command(args, key, value, timeout, queueTimeout, project.session)
        const root = project.reply.watch
        if (!root) return yield* Effect.fail(failure("Watchman watch-project omitted root"))
        const boundary = yield* command(["clock", root], "clock")
        const name = owner.nextName()
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
                if (options.defaultIgnores !== false && local.split("/").some((part) => part.startsWith(".watchman-cookie-"))) continue
                if (info.type !== "Directory" && local !== basename(target)) continue
                if (info.type === "Directory" && !watchOptions?.recursive && local.includes("/")) continue
                delivery.push({ _tag: !file.exists ? "Remove" : file.new ? "Create" : "Update", path: resolve(logical, local) })
              }
            }
          })
        }, catch: failure }), () => Effect.gen(function*() {
          connection.listeners.delete(name)
          delivery.fail(new Error("Watchman subscription scope closed"))
          const cleanup = options.cleanupTimeoutMs ?? 500
          // Give an abandoned subscribe its bounded wire deadline before the
          // cleanup's own on-wire deadline; don't truncate reply ownership.
          yield* command(["unsubscribe", root, name], "unsubscribe", name, cleanup,
            (options.requestTimeoutMs ?? 3000) + cleanup).pipe(Effect.ignore)
        }))
        const relativeRoot = relative(root, project.canonical)
        if (relativeRoot === ".." || relativeRoot.startsWith(".." + sep)) return yield* Effect.fail(failure("Watchman root does not contain target"))
        yield* command(["subscribe", root, name, {
          since: boundary.clock, fields: ["name", "exists", "new"],
          ...(relativeRoot ? { relative_root: relativeRoot } : {})
        }], "subscribe", name)
        return Stream.fromAsyncIterable(delivery, failure)
      })))
    }
  }
}
