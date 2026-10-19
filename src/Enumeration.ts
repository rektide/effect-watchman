import { Effect, FileSystem, PlatformError, Predicate } from "effect"

/** Coordinated structural contract; no dependency on the Plus runtime. */
export const TypeId = "~effect-watch/enumeration/v1"
export const CheckpointTypeId = "~effect-watch/checkpoint/v1"

export interface Request {
  /** Absolute or caller-resolved root. Returned names use '/' relative to it. */
  readonly root: string
  readonly patterns?: ReadonlyArray<string> | undefined
  /** Exact pathname globs, not gitignore rules. A directory match prunes it. */
  readonly exclude?: ReadonlyArray<string> | undefined
  readonly dot?: boolean | undefined
  readonly nocase?: boolean | undefined
  readonly kind?: "all" | "files" | "directories" | undefined
  /** Literal includes links themselves; follow additionally traverses linked dirs. */
  readonly symlinks?: "literal" | "follow" | undefined
  readonly metadata?: boolean | undefined
  /** Gitignore is an explicit ripgrep-only search profile. */
  readonly policy?: "literal" | "gitignore" | undefined
  /** Filesystem supplements daemon omissions; daemon explicitly accepts its scope. */
  readonly coverage?: "filesystem" | "daemon" | undefined
}

export interface Entry {
  readonly path: string
  readonly type: "File" | "Directory" | "SymbolicLink" | "Other"
  /** Symlink target classification when available; broken links have none. */
  readonly targetType?: "File" | "Directory" | "Other" | undefined
  readonly size?: number | undefined
  readonly mtimeMs?: number | undefined
}

/** Owner-bound token, not a portable Watchman clockspec or a continuity promise. */
export interface Checkpoint {
  readonly [CheckpointTypeId]: true
}

export type Baseline = {
  readonly complete: true
  readonly source: "native" | "ripgrep" | "watchman"
  readonly coverage: "filesystem" | "daemon"
  readonly entries: ReadonlyArray<Entry>
} & (
  | { readonly kind: "scanned" }
  | { readonly kind: "checkpointed"; readonly checkpoint: Checkpoint }
)

export interface Backend {
  readonly enumerate: (request: Request) => Effect.Effect<Baseline, PlatformError.PlatformError>
}

export interface GlobOptions extends Omit<Request, "root" | "patterns"> {
  readonly root?: string | undefined
}

export interface EnhancedFileSystem extends FileSystem.FileSystem {
  readonly [TypeId]: true
  readonly enumerate: Backend["enumerate"]
  readonly glob: (pattern: string, options?: GlobOptions) => Effect.Effect<Array<string>, PlatformError.PlatformError>
}

export function supports(fs: FileSystem.FileSystem): fs is EnhancedFileSystem {
  return Predicate.hasProperty(fs, TypeId) && fs[TypeId] === true
}

export const fileSystem = Effect.flatMap(FileSystem.FileSystem, (fs) => supports(fs)
  ? Effect.succeed(fs)
  : Effect.fail(PlatformError.badArgument({ module: "Glob", method: "fileSystem", description: "Enumeration is not installed" })))

/** Capture dependencies once. Glob defaults to process cwd, enumerate is explicit. */
export function make(fs: FileSystem.FileSystem, backend: Backend, cwd: () => string): EnhancedFileSystem {
  return {
    ...fs,
    [TypeId]: true,
    enumerate: backend.enumerate,
    glob: (pattern, options) => Effect.map(backend.enumerate({
      ...options, root: options?.root ?? cwd(), patterns: [pattern]
    }), (baseline) => baseline.entries.map((entry) => entry.path))
  }
}
