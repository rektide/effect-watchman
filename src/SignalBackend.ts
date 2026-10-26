import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { Effect, Stream } from "effect"
import { Delivery, SubscriptionCanceled } from "./Connection.js"
import { failure, type Owner, type Session } from "./Owner.js"
import { Recovery } from "./Recovery.js"

export function makeSignalBackend(owner: Owner): Recovery.Backend[typeof Recovery.BackendTypeId] {
  return {
    health: owner.health(),
    register: (target, info, options) => Stream.unwrap(Effect.gen(function*() {
      const context = yield* Effect.context<never>()
      const logical = resolve(info.type === "Directory" ? target : dirname(target))
      const delivery = new Delivery<Recovery.Signal>(owner.options.maxBufferedEvents ?? 1024)
      let sequence = 0
      let closed = false
      let release: (() => void) | undefined
      let lease: { session: Session; name: string; root: string } | undefined
      const terminate = (error: Error) => { delivery.fail(error); release?.() }
      const cleanup = async () => {
        const previous = lease
        lease = undefined
        if (!previous) return
        previous.session.connection.listeners.delete(previous.name)
        const timeout = owner.options.cleanupTimeoutMs ?? 500
        await previous.session.connection.command(["unsubscribe", previous.root, previous.name], "unsubscribe", previous.name,
          previous.session.abort.signal, timeout, Math.max((owner.options.requestTimeoutMs ?? 3000) + timeout, owner.options.queueTimeoutMs ?? 0)).catch(() => {})
      }
      yield* Effect.acquireRelease(Effect.sync(() => {
        release = owner.retain({
          fail: terminate,
          attach: async (session, signal) => {
            await cleanup()
            signal.throwIfAborted()
            const project = await Effect.runPromiseWith(context)(owner.project(logical, session))
            signal.throwIfAborted()
            const root = project.reply.watch
            if (!root) throw new Error("Watchman watch-project omitted root")
            const relativeRoot = relative(root, project.canonical)
            if (relativeRoot === ".." || relativeRoot.startsWith(".." + sep)) throw new Error("Watchman root does not contain target")
            const connection = session.connection
            const boundary = await connection.command(["clock", root], "clock", undefined, signal)
            const name = owner.nextName()
            lease = { session, name, root }
            let attaching = true
            let history = false
            const pending: Array<Recovery.Signal> = []
            const publish = (event: Recovery.Signal) => {
              if (!attaching) { delivery.push(event); return }
              if (pending.length >= delivery.capacity) { terminate(new Error("Watchman attachment delivery overflow")); return }
              pending.push(event)
            }
            connection.check()
            connection.listeners.set(name, {
              fail: (error) => { if (error instanceof SubscriptionCanceled) terminate(error) },
              push: (reply) => {
                if (closed) return
                if (reply.error) { terminate(new Error(reply.error)); return }
                if (reply.is_fresh_instance) {
                  if (attaching) history = true
                  else publish({ _tag: "Reset", reason: "history", generation: session.generation, sequence: ++sequence })
                }
                for (const file of reply.files ?? []) {
                  const local = file.name
                  if (isAbsolute(local) || local === ".." || local.split("/").includes("..")) { terminate(new Error("Watchman escaping path")); return }
                  if (owner.options.defaultIgnores !== false && local.split("/").some((part) => part.startsWith(".watchman-cookie-"))) continue
                  if (info.type !== "Directory" && local !== basename(target)) continue
                  if (info.type === "Directory" && !options?.recursive && local.includes("/")) continue
                  publish({ _tag: "Event", event: { _tag: !file.exists ? "Remove" : file.new ? "Create" : "Update", path: resolve(logical, local) } })
                }
              }
            })
            await connection.command(["subscribe", root, name, {
              since: boundary.clock, fields: ["name", "exists", "new"], ...(relativeRoot ? { relative_root: relativeRoot } : {})
            }], "subscribe", name, signal)
            signal.throwIfAborted()
            connection.check()
            // Ack precedes the boundary, even when file frames shared its socket
            // read. The boundary bypasses ignores and precedes all buffered hints.
            delivery.push({ _tag: "Reset", reason: history ? "history" : sequence === 0 ? "initial" : "transport", generation: session.generation, sequence: ++sequence })
            attaching = false
            pending.forEach((event) => delivery.push(event))
          }
        })
      }), () => Effect.gen(function*() {
        closed = true
        release?.()
        delivery.fail(new Error("Watchman signal scope closed"))
        yield* Effect.promise(cleanup)
      }))
      return Stream.fromAsyncIterable(delivery, failure)
    }))
  }
}
