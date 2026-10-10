export * as Watchman from "./Watch.js"

import { Effect, FileSystem, Layer, Option, Path, PlatformError, Predicate, Stream } from "effect"
import { backendLayer, type Options } from "./Backend.js"

export { backendLayer, type Options } from "./Backend.js"

/** Structural contract shared with Watch Plus, without a runtime dependency. */
export const TypeId = "~effect-watch/options/v1"

export interface WatchOptions extends FileSystem.WatchOptions {
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
export function make(fs: FileSystem.FileSystem, path: Path.Path, backend: FileSystem.WatchBackend["Service"]): EnhancedFileSystem {
  return {
    ...fs,
    [TypeId]: true,
    watch(target, options) {
      return Stream.unwrap(Effect.gen(function*() {
        const excluded = (options?.ignore ?? []).map((name) => path.relative(".", name))
        if (options?.ignore?.some((name) => path.isAbsolute(name)) || excluded.some((name) => name === "" || name === ".." || name.startsWith(".." + path.sep))) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "Watchman", method: "watch", description: "ignore paths must be nonempty relative paths within the watch directory"
          }))
        }
        const info = yield* fs.stat(target)
        if (options?.followReplacements && info.type !== "File") {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "Watchman", method: "watch", description: "followReplacements requires an existing file"
          }))
        }
        const directory = path.resolve(info.type === "Directory" ? target : path.dirname(target))
        const anchor = options?.followReplacements ? directory : target
        const anchorInfo = options?.followReplacements ? yield* fs.stat(anchor) : info
        const source = backend.register(anchor, anchorInfo, { recursive: options?.followReplacements ? false : options?.recursive })
        if (Option.isNone(source)) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "Watchman", method: "watch", description: "Backend declined the watch; native fallback is disabled"
          }))
        }
        return source.value.pipe(
          Stream.filter((event) => {
            const relative = path.relative(directory, path.resolve(directory, event.path))
            return (!options?.followReplacements || relative === path.basename(target)) &&
              !excluded.some((name) => relative === name || relative.startsWith(name + path.sep))
          }),
          Stream.concat(Stream.fail(PlatformError.systemError({
            module: "Watchman", method: "watch", _tag: "UnexpectedEof", pathOrDescriptor: target,
            description: "Backend ended; reconcile before restarting"
          })))
        )
      }))
    }
  }
}

/** Independent of Watch Plus. Provide one backend plus filesystem/Path services. */
export const fromBackend = Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const backend = yield* FileSystem.WatchBackend
  return make(fs, path, backend)
}))

/** Explicit socket-configured enhanced filesystem; requires base FileSystem and Path. */
export const layer = (options: Options) => fromBackend.pipe(Layer.provide(backendLayer(options)))
