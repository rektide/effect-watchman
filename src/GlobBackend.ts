import { lstat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { Effect } from "effect"
import { CheckpointTypeId, type Backend, type Entry, type Request } from "./Enumeration.js"
import { localEntry, walk } from "./Local.js"
import { badArgument, contains, failure, type Owner } from "./Owner.js"
import type { Options } from "./Owner.js"
import { safeName, selection } from "./Selection.js"
import type { Glob } from "./Glob.js"
import type { QueryReply } from "./Connection.js"
import type { Session } from "./Owner.js"

/** Daemon query budgets are deliberately separate from watch command deadlines. */
export function ownerOptions(options: Glob.Options): Options {
  const { queryTimeoutMs, querySyncTimeoutMs, queryLockTimeoutMs, maxQueryBytes, ...owner } = options
  return { ...owner, maxFrameBytes: owner.maxFrameBytes ?? 64 * 1024 * 1024, queueTimeoutMs: owner.queueTimeoutMs ?? queryTimeoutMs ?? 65_000 }
}

export function makeGlobBackend(owner: Owner, options: Glob.Options): Backend {
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
      const scope = yield* owner.scope(request.root)
      if (scope === "missing") return {
        complete: true as const, source: "watchman" as const, coverage: request.coverage ?? "filesystem",
        kind: "scanned" as const, entries: []
      }
      if (scope === "local") {
        if (request.coverage === "daemon") return yield* Effect.fail(badArgument("A symlink-root outside approval has no daemon coverage; use filesystem coverage for local supplementation"))
        // The explicit root itself resolves through a link outside approval.
        // Follow it locally, but never acquire an unapproved target daemon root.
        const entries = yield* Effect.tryPromise({ try: async (signal) => {
          if (request.symlinks !== "glob") return walk(request, ["."], signal)
          const { nativeGlob } = await import("./GlobView.js")
          return nativeGlob(request, signal)
        }, catch: failure })
        return {
          complete: true as const, source: "watchman" as const, coverage: request.coverage ?? "filesystem",
          kind: "scanned" as const, entries: entries.filter(matcher.accepts).sort((a, b) => a.path.localeCompare(b.path, "en"))
        }
      }
      const project = yield* owner.project(request.root)
      const root = project.reply.watch
      if (!root || !contains(root, project.canonical)) return yield* Effect.fail(failure("Watchman root does not contain query directory"))
      const subtree = relative(root, project.canonical)
      const query = (globs: ReadonlyArray<string>, links: boolean) => Effect.tryPromise({
        try: (signal) => queryLexical(project.session, root, subtree, request, globs, matcher.literalExcludes, links, options, signal), catch: failure
      })
      const result = yield* query(matcher.candidates, false)
      const entries = new Map<string, Entry>()
      const linkNames = new Set<string>()
      const decode = (files: typeof result.files) => Effect.try({ try: () => {
        for (const file of files) {
          if (typeof file === "string") throw new Error("Typed query returned name-only rows")
          if (request.metadata && (typeof file.size !== "number" || typeof file.mtime_ms !== "number")) throw new Error("Watchman omitted requested metadata")
          const entry = lexicalEntry(file, request.metadata ?? false)
          entries.set(entry.path, entry)
          if (entry.type === "SymbolicLink") linkNames.add(entry.path)
        }
      }, catch: failure })
      yield* decode(result.files)
      if (request.symlinks === "follow" || request.symlinks === "glob") {
        // Separate pushed-down type query finds links that are ancestors of a
        // match, even when the result pattern itself cannot match the link.
        const links = yield* query(matcher.links, true)
        yield* decode(links.files)
      }
       const config = request.coverage === "daemon" ? undefined : yield* owner.config(root, project.session)
      const supplemented = yield* Effect.tryPromise({ try: async (signal) => {
        let mixed = false
        const starts = new Set<string>()
        for (const input of [...(config?.config.ignore_dirs ?? []), ...(config?.config.ignore_vcs ?? (config ? [".git", ".hg", ".svn", ".jj"] : []))]) {
          const ignored = resolve(root, input)
          if (!contains(root, ignored)) throw new Error("Watchman ignore path escapes the approved root")
          const local = relative(project.canonical, ignored)
          const name = contains(ignored, project.canonical) ? "." : contains(project.canonical, ignored) ? (sep === "\\" ? local.replaceAll("\\", "/") : local) : undefined
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
      const selected = request.symlinks === "glob"
        ? yield* Effect.tryPromise({ try: async (signal) => {
          const { globView } = await import("./GlobView.js")
          return globView(request, [...entries.values()], signal)
        }, catch: failure })
        : [...entries.values()].filter(matcher.accepts)
      selected.sort((a, b) => a.path.localeCompare(b.path, "en"))
      const common = { complete: true as const, source: "watchman" as const, coverage: request.coverage ?? "filesystem", entries: selected }
      if (supplemented) return { ...common, kind: "scanned" as const }
      const checkpoint = { [CheckpointTypeId]: true as const }
      return { ...common, kind: "checkpointed" as const, checkpoint }
    })
  }
}

export function queryLexical(session: Session, root: string, subtree: string, request: Request,
  globs: ReadonlyArray<string>, excludes: ReadonlyArray<string>, links: boolean, options: Glob.Options, signal: AbortSignal): Promise<QueryReply> {
  return session.connection.query(["query", root, {
    ...(subtree ? { relative_root: subtree } : {}), glob: globs, glob_includedotfiles: true, glob_noescape: false,
    case_sensitive: !request.nocase,
    expression: ["allof", ["exists"], ...(links ? [["type", "l"]] : []),
      ...excludes.map((name) => ["not", ["anyof", ["name", name, "wholename"], ["dirname", name]]])],
    fields: ["name", "type", ...(request.metadata ? ["size", "mtime_ms"] : [])],
    sync_timeout: options.querySyncTimeoutMs ?? 30_000, lock_timeout: options.queryLockTimeoutMs ?? 30_000
  }], signal, options.queryTimeoutMs ?? 65_000, options.maxQueryBytes ?? 32 * 1024 * 1024)
}

export function lexicalEntry(file: { readonly name: string; readonly type?: string | undefined; readonly size?: number | null | undefined; readonly mtime_ms?: number | null | undefined }, metadata = true): Entry {
  const path = safeName(file.name)
  if (!["f", "d", "l", "b", "c", "p", "s", "D"].includes(file.type ?? "")) throw new Error("Unknown Watchman entry type")
  return { path, type: file.type === "f" ? "File" : file.type === "d" ? "Directory" : file.type === "l" ? "SymbolicLink" : "Other",
    ...(metadata ? { size: file.size ?? undefined, mtimeMs: file.mtime_ms ?? undefined } : {}) }
}
