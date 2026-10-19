export * as Glob from "./Glob.js"
export * from "./Enumeration.js"

import { Effect, FileSystem, Layer } from "effect"
import type { ConnectionOptions } from "./Connection.js"
import { make } from "./Enumeration.js"
import { makeGlobBackend, ownerOptions } from "./GlobBackend.js"
import { makeOwner } from "./Owner.js"

export interface Options extends ConnectionOptions {
  /** Exact, explicit daemon acquisition boundaries. Must be absolute. */
  readonly approvedRoots: ReadonlyArray<string>
  readonly queryTimeoutMs?: number | undefined
  readonly querySyncTimeoutMs?: number | undefined
  readonly queryLockTimeoutMs?: number | undefined
  readonly maxQueryBytes?: number | undefined
}

/** Glob-only decoration. For shared watching use Watchman.layerWithGlob. */
export const layer = (options: Options) => Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const owner = yield* makeOwner(ownerOptions(options))
  return make(fs, makeGlobBackend(owner, options), () => process.cwd())
}))
