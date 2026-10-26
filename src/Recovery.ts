export * as Recovery from "./Recovery.js"

import { Effect, FileSystem, PlatformError, Predicate, Stream } from "effect"
import type { Health } from "./Owner.js"
import type { WatchOptions } from "./Watch.js"

export type { Health, RecoveryOptions } from "./Owner.js"
export const TypeId = "~effect-watchman/recovery/v1"
export const BackendTypeId = "~effect-watchman/recovery-backend/v1"
export type Signal = {
  readonly _tag: "Reset"
  readonly reason: "initial" | "transport" | "history"
  readonly generation: number
  readonly sequence: number
} | { readonly _tag: "Event"; readonly event: FileSystem.WatchEvent }
export interface Capability {
  readonly watch: (target: string, options?: WatchOptions) => Stream.Stream<Signal, PlatformError.PlatformError>
  readonly health: Effect.Effect<Health>
}
export interface EnhancedFileSystem extends FileSystem.FileSystem {
  readonly [TypeId]: Capability
}
export type Backend = FileSystem.WatchBackend["Service"] & {
  readonly [BackendTypeId]: {
    readonly register: (target: string, info: FileSystem.File.Info, options?: FileSystem.WatchOptions) => Stream.Stream<Signal, PlatformError.PlatformError>
    readonly health: Effect.Effect<Health>
  }
}
export function supports(fs: FileSystem.FileSystem): fs is EnhancedFileSystem {
  const capability = Predicate.hasProperty(fs, TypeId) ? fs[TypeId] : undefined
  return Predicate.hasProperty(capability, "watch") && typeof capability.watch === "function" &&
    Predicate.hasProperty(capability, "health") && Effect.isEffect(capability.health)
}
export function supportsBackend(backend: FileSystem.WatchBackend["Service"]): backend is Backend {
  const capability = Predicate.hasProperty(backend, BackendTypeId) ? backend[BackendTypeId] : undefined
  return Predicate.hasProperty(capability, "register") && typeof capability.register === "function" &&
    Predicate.hasProperty(capability, "health") && Effect.isEffect(capability.health)
}
/** Optional checked view of the same filesystem object, never a new owner. */
export const fileSystem = Effect.flatMap(FileSystem.FileSystem, (fs) => supports(fs)
  ? Effect.succeed(fs[TypeId])
  : Effect.fail(PlatformError.badArgument({ module: "Watchman", method: "recovery", description: "Watchman recovery signals are not installed" })))
