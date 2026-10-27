export * as Inventory from "./Inventory.js"
export * from "effect-watch-plus/inventory"

import { Effect, FileSystem, Stream } from "effect"
import { TypeId, supports } from "effect-watch-plus/inventory"
import type { InventorySource, InventoryEvent, InventoryChange, SourceState } from "effect-watch-plus/inventory"
import { isAbsolute, relative, resolve } from "node:path"
import { SubscriptionCanceled } from "./Connection.js"
import type { Reply } from "./Connection.js"
import { badArgument, contains, failure } from "./Owner.js"
import type { Owner, Session } from "./Owner.js"
import type { Glob } from "./Glob.js"
import { lexicalEntry, queryLexical } from "./GlobBackend.js"
import { safeName } from "./Selection.js"
import { begin, end, measure } from "./Diagnostics.js"

export const fileSystem = Effect.flatMap(FileSystem.FileSystem, (fs) => supports(fs)
  ? Effect.succeed(fs[TypeId])
  : Effect.fail(badArgument("Observed inventory is not installed")))

export function makeInventorySource(owner: Owner, options: Glob.Options): InventorySource {
  return { open: (profile) => Effect.gen(function*() {
    const budgets = {
      maxQueuedRows: 16_384, maxQueuedBytes: 8 * 1024 * 1024,
      maxBaselineBytes: options.maxQueryBytes ?? 32 * 1024 * 1024, maxPairAttempts: 3, pairRetryMs: 100,
      ...Object.fromEntries(Object.entries(profile.budgets ?? {}).filter(([, value]) => value !== undefined))
    }
    if (!isAbsolute(profile.root) || !options.approvedRoots.length || Object.values(budgets).some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      (options.queryTimeoutMs ?? 65_000) <= (options.querySyncTimeoutMs ?? 30_000) + (options.queryLockTimeoutMs ?? 30_000)) {
      return yield* Effect.fail(badArgument("Observed inventory requires an absolute approved root and positive budgets; query timeout must exceed sync + lock timeouts"))
    }
    const context = yield* Effect.context<never>()
    const run = Effect.runPromiseWith(context)
    const delivery = new InventoryDelivery(budgets.maxQueuedRows, budgets.maxQueuedBytes)
    let state: SourceState = { state: "acquiring", epoch: 1 }
    let sequence = 0
    let failures = 0
    let consumed = false
    let release: (() => void) | undefined
    let lease: { session: Session; name: string; root: string } | undefined
    let operation: AbortController | undefined
    let cleaning = Promise.resolve()
    const detach = () => {
      const previous = lease
      lease = undefined
      if (!previous) return cleaning
      previous.session.connection.listeners.delete(previous.name)
      cleaning = cleaning.then(async () => {
        const timeout = owner.options.cleanupTimeoutMs ?? 500
        await previous.session.connection.command(["unsubscribe", previous.root, previous.name], "unsubscribe", previous.name,
          previous.session.abort.signal, timeout, Math.max((owner.options.requestTimeoutMs ?? 3000) + timeout, owner.options.queueTimeoutMs ?? 0)).catch(() => {})
      })
      return cleaning
    }
    const terminate = (error: Error) => {
      if (state.state === "closed" || state.state === "failed") return
      state = { state: "failed", epoch: state.epoch, reason: error.message }
      operation?.abort()
      delivery.fail(error)
      release?.()
      void detach()
    }
    const publish = (event: InventoryEvent) => {
      if (!delivery.push(event)) terminate(new Error("Watchman inventory queued-change budget exceeded"))
    }
    const invalidate = (reason: string) => {
      if (state.state === "failed" || state.state === "closed") return
      const epoch = state.epoch
      state = { state: "repairing", epoch: epoch + 1, reason }
      sequence = 0
      operation?.abort()
      void detach()
      delivery.clear()
      publish({ type: "invalidated", epoch, reason })
    }
    const attach = async (session: Session, ownerSignal: AbortSignal) => {
        if (state.state === "failed" || state.state === "closed") return
        if (state.state === "active") invalidate("transport")
        const epoch = state.epoch
        operation = new AbortController()
        const signal = AbortSignal.any([ownerSignal, session.abort.signal, operation.signal])
        const current = () => state.epoch === epoch && state.state !== "failed" && state.state !== "closed" && !signal.aborted
        try {
          await detach()
          signal.throwIfAborted()
          const project = await run(owner.project(profile.root, session))
          signal.throwIfAborted()
          const root = project.reply.watch
          if (!root || !contains(root, project.canonical)) throw new Error("Watchman root does not contain inventory directory")
          const config = await session.connection.config(root, signal)
          for (const input of [...(config.config.ignore_dirs ?? []), ...(config.config.ignore_vcs ?? [".git", ".hg", ".svn", ".jj"])]) {
            const ignored = resolve(root, input)
            if (!contains(root, ignored)) throw new Error("Watchman ignore path escapes approved root")
            if (contains(ignored, project.canonical)) throw new Error("Inventory source conflict: requested root is excluded by Watchman configuration")
          }
          const subtree = relative(root, project.canonical)
          if (failures > 0) await run(Effect.sleep(budgets.pairRetryMs), { signal })
          while (current()) {
            const result = await queryLexical(session, root, subtree, { root: profile.root, metadata: true }, ["**/*"], [], false,
              { ...options, maxQueryBytes: budgets.maxBaselineBytes }, signal)
            signal.throwIfAborted()
            const entries = measure("lexical", () => result.files.map((file) => {
              if (typeof file === "string") throw new Error("Typed inventory query returned name-only rows")
              return lexicalEntry(file)
            }), 0, result.files.length)
            measure("sort", () => entries.sort((a, b) => a.path.localeCompare(b.path, "en")), 0, entries.length)
            const name = owner.nextName()
            lease = { session, root, name }
            let attaching = true
            let fresh = false
            let stagedRows = 0
            let stagedBytes = 0
            const staged: InventoryEvent[] = []
            session.connection.listeners.set(name, {
              fail: (error) => {
                if (!current()) return
                if (error instanceof SubscriptionCanceled) { terminate(error); return }
                invalidate("transport")
              },
              push: (reply: Reply) => {
                if (!current() || lease?.name !== name) return
                if (reply.error) { terminate(new Error(reply.error)); return }
                if (reply.is_fresh_instance) {
                  fresh = true
                  if (!attaching) {
                    if (++failures >= budgets.maxPairAttempts) { terminate(new Error("Watchman inventory fresh-history retry budget exhausted")); return }
                    invalidate("history")
                    owner.refresh(interest)
                  }
                  return
                }
                if (fresh) return
                const changes: InventoryChange[] = []
                const start = begin()
                try {
                  for (const file of reply.files ?? []) {
                    const path = safeName(file.name)
                    if (path.split("/").some((part) => part.startsWith(".watchman-cookie-"))) continue
                    changes.push(file.exists ? { type: "present", entry: lexicalEntry(file) } : { type: "removed", path })
                  }
                } catch (error) { terminate(error instanceof Error ? error : new Error(String(error))); return }
                finally { end("lexical", start, 0, reply.files?.length ?? 0) }
                if (!changes.length) return
                const event: InventoryEvent = { type: "changes", epoch, sequence: ++sequence, changes }
                if (!attaching) { failures = 0; publish(event); return }
                stagedRows += changes.length
                stagedBytes += Buffer.byteLength(JSON.stringify(event))
                if (stagedRows > budgets.maxQueuedRows || stagedBytes > budgets.maxQueuedBytes) { terminate(new Error("Watchman inventory attachment budget exceeded")); return }
                staged.push(event)
              }
            })
            await session.connection.command(["subscribe", root, name, {
              since: result.clock, fields: ["name", "type", "exists", "new", "size", "mtime_ms"],
              ...(subtree ? { relative_root: subtree } : {})
            }], "subscribe", name, signal)
            if (!current()) return
            session.connection.check()
            if (fresh) {
              await detach()
              if (++failures >= budgets.maxPairAttempts) throw new Error("Watchman inventory fresh-history retry budget exhausted")
              await run(Effect.sleep(budgets.pairRetryMs), { signal })
              continue
            }
            state = { state: "active", epoch }
            publish({ type: "baseline", epoch, entries })
            attaching = false
            staged.forEach(publish)
            return
          }
        } catch (error) {
          if (!current()) return
          throw error
        }
    }
    const interest = {
      fail: terminate,
      attach: (session: Session, signal: AbortSignal) => run(Effect.tryPromise({
        try: () => attach(session, signal), catch: (error) => error
      }).pipe(Effect.withSpan("Watchman.inventory.attach")))
    }
    yield* Effect.acquireRelease(Effect.sync(() => { release = owner.retain(interest) }), () => Effect.gen(function*() {
      state = { state: "closed", epoch: state.epoch }
      release?.()
      operation?.abort()
      delivery.fail(new Error("Watchman inventory scope closed"))
      yield* Effect.promise(detach)
    }))
    return {
      state: Effect.sync(() => state),
      events: Stream.unwrap(Effect.suspend(() => {
        if (consumed) return Effect.fail(badArgument("Observed inventory events support one consumer"))
        consumed = true
        return Effect.succeed(Stream.fromAsyncIterable(delivery, failure))
      })),
      rebaseline: (reason: string) => Effect.suspend(() => {
        if (state.state === "failed" || state.state === "closed") return Effect.fail(failure(state.reason ?? "Inventory view is closed"))
        invalidate(reason)
        owner.refresh(interest)
        return Effect.void
      }).pipe(Effect.withSpan("Watchman.inventory.rebaseline"))
    }
  }).pipe(Effect.withSpan("Watchman.inventory.open")) }
}

class InventoryDelivery implements AsyncIterable<InventoryEvent> {
  values: Array<{ event: InventoryEvent; rows: number; bytes: number }> = []
  rows = 0
  bytes = 0
  error: Error | undefined
  waiter: { resolve: (value: IteratorResult<InventoryEvent>) => void; reject: (error: Error) => void } | undefined
  constructor(readonly maxRows: number, readonly maxBytes: number) {}
  clear() { this.values = []; this.rows = 0; this.bytes = 0 }
  push(event: InventoryEvent): boolean {
    if (this.error) return false
    const rows = event.type === "changes" ? event.changes.length : 0
    const bytes = event.type === "changes" ? Buffer.byteLength(JSON.stringify(event)) : 0
    if (rows + this.rows > this.maxRows || bytes + this.bytes > this.maxBytes) return false
    if (this.waiter) { this.waiter.resolve({ done: false, value: event }); this.waiter = undefined; return true }
    this.rows += rows; this.bytes += bytes
    this.values.push({ event, rows, bytes })
    return true
  }
  fail(error: Error) { this.error ??= error; this.clear(); this.waiter?.reject(this.error); this.waiter = undefined }
  [Symbol.asyncIterator](): AsyncIterator<InventoryEvent> {
    return { next: () => {
      if (this.error) return Promise.reject(this.error)
      const value = this.values.shift()
      if (value) { this.rows -= value.rows; this.bytes -= value.bytes; return Promise.resolve({ done: false, value: value.event }) }
      return new Promise((resolve, reject) => { this.waiter = { resolve, reject } })
    }, return: () => { this.waiter = undefined; return Promise.resolve({ done: true, value: undefined }) } }
  }
}
