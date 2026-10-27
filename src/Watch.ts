export * as Watchman from "./Watch.js"

import { Effect, FileSystem, Layer, Option, Path, PlatformError, Predicate, Stream } from "effect"
import { backendLayer, makeBackend } from "./Backend.js"
import { Glob } from "./Glob.js"
import { makeGlobBackend, ownerOptions } from "./GlobBackend.js"
import { makeOwner } from "./Owner.js"
import type { ConnectionOptions } from "./Connection.js"
import type { RecoveryOptions } from "./Owner.js"
import { Recovery } from "./Recovery.js"
import { compileIgnore, resolveIgnore, type IgnoreOptions } from "./Ignore.js"
import { Inventory } from "./Inventory.js"

export { backendLayer } from "./Backend.js"
export { defaultIgnores, resolveIgnore, type IgnoreOptions } from "./Ignore.js"
export type Options = ConnectionOptions & RecoveryOptions & IgnoreOptions

/** Structural contract shared with Watch Plus, without a runtime dependency. */
export const TypeId = "~effect-watch/options/v2"

export interface WatchOptions extends FileSystem.WatchOptions, IgnoreOptions {
  /** Relative literal subtrees or exact-path globs; see README for syntax. */
  readonly ignore?: ReadonlyArray<string> | undefined
  readonly followReplacements?: boolean | undefined
}

export interface EnhancedFileSystem extends FileSystem.FileSystem {
  readonly [TypeId]: true
  readonly watch: (path: string, options?: WatchOptions) => Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError>
}

export function supports(fs: FileSystem.FileSystem): fs is EnhancedFileSystem {
  return Predicate.hasProperty(fs, TypeId) && fs[TypeId] === true
}

export const fileSystem = Effect.flatMap(FileSystem.FileSystem, (fs) => supports(fs)
  ? Effect.succeed(fs)
  : Effect.fail(PlatformError.badArgument({
    module: "Watchman", method: "fileSystem", description: "Enhanced watch options are not installed"
  })))

/**
 * Direct enhanced backend route. Never calls the captured fs.watch or a Plus
 * decorator. The backend is captured once, not constructed for each stream.
 * The socket-configured backendLayer supplies the shared scoped daemon manager.
 */
export function make(fs: FileSystem.FileSystem, path: Path.Path, backend: FileSystem.WatchBackend["Service"], instance?: IgnoreOptions): EnhancedFileSystem {
  const prepare = (target: string, options?: WatchOptions) => Effect.gen(function*() {
    const excluded = yield* Effect.try({
      try: () => compileIgnore(resolveIgnore(options, instance), path),
      catch: (cause) => PlatformError.badArgument({ module: "Watchman", method: "watch", description: String(cause) })
    })
    const info = yield* fs.stat(target)
    if (options?.followReplacements && info.type !== "File") {
      return yield* Effect.fail(PlatformError.badArgument({ module: "Watchman", method: "watch", description: "followReplacements requires an existing file" }))
    }
    const directory = path.resolve(info.type === "Directory" ? target : path.dirname(target))
    const anchor = options?.followReplacements ? directory : target
    const anchorInfo = options?.followReplacements ? yield* fs.stat(anchor) : info
    const selected = (event: FileSystem.WatchEvent) => {
      const relative = path.relative(directory, path.resolve(directory, event.path))
      return (!options?.followReplacements || relative === path.basename(target)) && !excluded(relative)
    }
    return { anchor, anchorInfo, selected, options: { recursive: options?.followReplacements ? false : options?.recursive } }
  })
  const enhanced: EnhancedFileSystem = {
    ...fs,
    [TypeId]: true,
    watch(target, options) {
      return Stream.unwrap(Effect.gen(function*() {
         const prepared = yield* prepare(target, options)
         const source = backend.register(prepared.anchor, prepared.anchorInfo, prepared.options)
        if (Option.isNone(source)) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "Watchman", method: "watch", description: "Backend declined the watch; native fallback is disabled"
          }))
        }
        return source.value.pipe(
           Stream.filter(prepared.selected),
          Stream.concat(Stream.fail(PlatformError.systemError({
            module: "Watchman", method: "watch", _tag: "UnexpectedEof", pathOrDescriptor: target,
            description: "Backend ended; reconcile before restarting"
          })))
        )
      }))
    }
  }
  if (!Recovery.supportsBackend(backend)) return enhanced
  const capability: Recovery.Capability = {
    health: backend[Recovery.BackendTypeId].health,
    watch: (target, options) => Stream.unwrap(Effect.gen(function*() {
      const prepared = yield* prepare(target, options)
      return backend[Recovery.BackendTypeId].register(prepared.anchor, prepared.anchorInfo, prepared.options).pipe(
        Stream.filter((signal) => signal._tag === "Reset" || prepared.selected(signal.event))
      )
    }))
  }
  return Object.assign(enhanced, { [Recovery.TypeId]: capability })
}

/** Independent of Watch Plus. Provide one backend plus filesystem/Path services. */
export const configured = (options?: IgnoreOptions) => Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const backend = yield* FileSystem.WatchBackend
  return make(fs, path, backend, options)
}))

export const fromBackend = configured()

/** Explicit socket-configured enhanced filesystem; requires base FileSystem and Path. */
export const layer = (options: Options) => {
  // Enhanced policy owns filtering so individual watches can explicitly opt out.
  const { ignore, ...backend } = options
  return configured(options).pipe(Layer.provide(backendLayer({ ...backend, defaultIgnores: false })))
}

/** One connection and exact approved-root cache for both watch and enumeration. */
export const layerWithGlob = (options: Glob.Options & IgnoreOptions) => Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { ignore, ...raw } = options
  const owner = yield* makeOwner({ ...ownerOptions(raw), defaultIgnores: false })
  const enhanced = make(fs, path, makeBackend(owner), options)
  return Object.assign(Glob.make(enhanced, makeGlobBackend(owner, options), () => process.cwd()), { [Inventory.TypeId]: Inventory.makeInventorySource(owner, options) })
}))
