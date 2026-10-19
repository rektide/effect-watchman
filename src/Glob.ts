export * as Glob from "./Glob.js"
export * from "./Enumeration.js"

import { lstat } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { Effect, FileSystem, Layer } from "effect"
import { CheckpointTypeId, make, type Backend, type Entry, type Request } from "./Enumeration.js"
import { localEntry, walk } from "./Local.js"
import { badArgument, contains, failure, makeOwner, type Options as OwnerOptions, type Owner } from "./Owner.js"
import { safeName, selection } from "./Selection.js"

export interface Options extends OwnerOptions {
  /** Exact, explicit daemon acquisition boundaries. Must be absolute. */
  readonly approvedRoots: ReadonlyArray<string>
  readonly queryTimeoutMs?: number | undefined
  readonly querySyncTimeoutMs?: number | undefined
  readonly queryLockTimeoutMs?: number | undefined
  readonly maxQueryBytes?: number | undefined
}

/** Daemon query budgets are deliberately separate from watch command deadlines. */
export function ownerOptions(options: Options): OwnerOptions {
  const { queryTimeoutMs, querySyncTimeoutMs, queryLockTimeoutMs, maxQueryBytes, ...owner } = options
  return { ...owner, maxFrameBytes: owner.maxFrameBytes ?? 64 * 1024 * 1024, queueTimeoutMs: owner.queueTimeoutMs ?? queryTimeoutMs ?? 65_000 }
}

export function makeBackend(owner: Owner, options: Options): Backend {
  const checkpoints = new WeakMap<object, { root: string; request: Request; clock: string }>()
  return {
    enumerate: (request) => Effect.gen(function*() {
      const timeout = options.queryTimeoutMs ?? 65_000
      const sync = options.querySyncTimeoutMs ?? 30_000
      const lock = options.queryLockTimeoutMs ?? 30_000
      if (!options.approvedRoots.length || [timeout, sync, lock, options.maxQueryBytes ?? 32 * 1024 * 1024].some((value) => !Number.isSafeInteger(value) || value <= 0) || timeout <= sync + lock) {
        return yield* Effect.fail(badArgument("approvedRoots must be nonempty; positive query budgets require queryTimeoutMs > querySyncTimeoutMs + queryLockTimeoutMs"))
      }
      if (request.policy === "gitignore") return yield* Effect.fail(badArgument("Watchman does not implement the gitignore profile; select a ripgrep backend explicitly"))
      if (!request.root || !isAbsolute(request.root)) return yield* Effect.fail(badArgument("enumerate requires an absolute root"))
      const matcher = yield* Effect.try({ try: () => selection(request), catch: (cause) => badArgument(String(cause)) })
      const project = yield* owner.project(request.root)
      const root = project.reply.watch
      if (!root || !contains(root, project.canonical)) return yield* Effect.fail(failure("Watchman root does not contain query directory"))
      const subtree = relative(root, project.canonical).replaceAll("\\", "/")
      const query = (globs: ReadonlyArray<string>, links: boolean) => Effect.tryPromise({
        try: (signal) => owner.connection.query(["query", root, {
          ...(subtree ? { relative_root: subtree } : {}),
          glob: globs,
          glob_includedotfiles: true,
          glob_noescape: false,
          case_sensitive: !request.nocase,
          expression: links ? ["allof", ["exists"], ["type", "l"]] : ["exists"],
          fields: ["name", "type", ...(request.metadata ? ["size", "mtime_ms"] : [])],
          sync_timeout: sync, lock_timeout: lock
        }], signal, timeout, options.maxQueryBytes ?? 32 * 1024 * 1024), catch: failure
      })
      const result = yield* query(matcher.candidates, false)
      const entries = new Map<string, Entry>()
      const linkNames = new Set<string>()
      const decode = (files: typeof result.files) => Effect.try({ try: () => {
        for (const file of files) {
          if (typeof file === "string") throw new Error("Typed query returned name-only rows")
          const name = safeName(file.name)
          if (!["f", "d", "l", "b", "c", "p", "s", "D"].includes(file.type)) throw new Error("Unknown Watchman entry type")
          if (request.metadata && (typeof file.size !== "number" || typeof file.mtime_ms !== "number")) throw new Error("Watchman omitted requested metadata")
          const type = file.type === "f" ? "File" : file.type === "d" ? "Directory" : file.type === "l" ? "SymbolicLink" : "Other"
          entries.set(name, { path: name, type, ...(request.metadata ? { size: file.size ?? undefined, mtimeMs: file.mtime_ms ?? undefined } : {}) })
          if (type === "SymbolicLink") linkNames.add(name)
        }
      }, catch: failure })
      yield* decode(result.files)
      if (request.symlinks === "follow") {
        // Separate pushed-down type query finds links that are ancestors of a
        // match, even when the result pattern itself cannot match the link.
        const links = yield* query(matcher.links, true)
        yield* decode(links.files)
      }
      const config = request.coverage === "daemon" ? undefined : yield* owner.config(root)
      const supplemented = yield* Effect.tryPromise({ try: async (signal) => {
        let mixed = false
        const starts = new Set<string>()
        for (const input of [...(config?.config.ignore_dirs ?? []), ...(config?.config.ignore_vcs ?? (config ? [".git", ".hg", ".svn", ".jj"] : []))]) {
          const ignored = resolve(root, input)
          if (!contains(root, ignored)) throw new Error("Watchman ignore path escapes the approved root")
          const name = contains(ignored, project.canonical) ? "." : contains(project.canonical, ignored) ? relative(project.canonical, ignored).replaceAll("\\", "/") : undefined
          if (name === undefined || !matcher.mayDescend(name)) continue
          const present = await lstat(resolve(request.root, name)).then(() => true, (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT" || error.code === "ENOTDIR") return false
            throw error
          })
          if (present) starts.add(name)
        }
        for (const name of linkNames) {
          signal.throwIfAborted()
          const entry = await localEntry(request.root, name, request.metadata ?? false)
          entries.set(name, entry)
          mixed = true
          if (request.symlinks === "follow" && entry.targetType === "Directory" && matcher.mayDescend(name)) starts.add(name)
        }
        if (starts.size) {
          const minimal = [...starts].filter((name, _, all) => !all.some((parent) => parent !== name && (parent === "." || name.startsWith(parent + "/"))))
          for (const entry of await walk(request, minimal, signal)) entries.set(entry.path, entry)
          mixed = true
        }
        const rootEntry: Entry = { path: ".", type: "Directory" }
        if (matcher.accepts(rootEntry)) {
          entries.set(".", request.metadata ? await localEntry(request.root, ".", true) : rootEntry)
          if (request.metadata) mixed = true
        }
        return mixed
      }, catch: failure })
      const selected = [...entries.values()].filter(matcher.accepts).sort((a, b) => a.path.localeCompare(b.path, "en"))
      const common = { complete: true as const, source: "watchman" as const, coverage: request.coverage ?? "filesystem", entries: selected }
      if (supplemented) return { ...common, kind: "scanned" as const }
      const checkpoint = { [CheckpointTypeId]: true as const }
      checkpoints.set(checkpoint, { root, request, clock: result.clock })
      return { ...common, kind: "checkpointed" as const, checkpoint }
    })
  }
}

/** Glob-only decoration. For shared watching use Watchman.layerWithGlob. */
export const layer = (options: Options) => Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const owner = yield* makeOwner(ownerOptions(options))
  return make(fs, makeBackend(owner, options), () => process.cwd())
}))
