import { expect, test } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Deferred, Effect, Fiber, FileSystem, Layer, Option, Path, PlatformError, Stream } from "effect"
import { Watchman } from "../effect-watchman.js"

const base = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
const temporary = (fs: FileSystem.FileSystem) => fs.makeTempDirectoryScoped({
  directory: process.env.WATCH_TEST_DIRECTORY, prefix: "watchman-seam-"
})

test("independent richer watch options never invoke fs.watch; ordinary methods remain native", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const original = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* temporary(original)
    const calls: Array<string> = []
    const fs = Watchman.make({ ...original, watch: () => Stream.die("native watch must not run") }, path, {
      register: (anchor, _info, options) => {
        calls.push(`${anchor}:${options?.recursive}`)
        return Option.some(Stream.fromArray<FileSystem.WatchEvent>([
          { _tag: "Remove", path: "ignored/nested/deleted" },
          { _tag: "Update", path: "ignored-sibling/keep" },
          { _tag: "Remove", path: "nested/deleted" }
        ]))
      }
    })
    expect(fs.readFileString).toBe(original.readFileString)
    const viewed = yield* Watchman.fileSystem.pipe(Effect.provideService(FileSystem.FileSystem, fs))
    expect(viewed).toBe(fs)
    const result = yield* viewed.watch(target, { recursive: true, ignore: ["./ignored/"] }).pipe(Stream.take(2), Stream.runCollect)
    expect(result.map((event) => event.path)).toEqual(["ignored-sibling/keep", "nested/deleted"])
    expect(calls).toEqual([`${target}:true`])
    viewed.watch(target)
    viewed.watch(target, { followReplacements: true })
    // @ts-expect-error the enhanced view rejects unknown options
    viewed.watch(target, { ignroe: ["ignored"] })
  })).pipe(Effect.provide(base)))
})

test("followReplacements routes to one parent registration and filters siblings", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* temporary(fs)
    const target = directory + "/config"
    yield* fs.writeFileString(target, "before")
    const calls: Array<string> = []
    const watched = Watchman.make(fs, path, { register: (anchor, info, options) => {
      calls.push(`${anchor}:${info.type}:${options?.recursive}`)
      return Option.some(Stream.fromArray<FileSystem.WatchEvent>([
        { _tag: "Update", path: "other" },
        { _tag: "Create", path: "config" },
        { _tag: "Update", path: path.join(directory, "config") }
      ]))
    } })
    const result = yield* watched.watch(target, { followReplacements: true }).pipe(Stream.take(2), Stream.runCollect)
    expect(result.map((event) => event.path)).toEqual(["config", path.join(directory, "config")])
    expect(calls).toEqual([`${directory}:Directory:false`])
  })).pipe(Effect.provide(base)))
})

test("invalid requests, declined watches, completion and continuity errors fail explicitly", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* temporary(fs)
    const declined = Watchman.make(fs, path, { register: () => Option.none() })
    for (const options of [{}, { ignore: ["../outside"] }, { ignore: ["!keep"] }, { ignore: ["{..,safe}/x"] }, { followReplacements: true }]) {
      const result = yield* declined.watch(target, options).pipe(Stream.runDrain, Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("BadArgument")
    }
    const closed = Watchman.make(fs, path, { register: () => Option.some(Stream.empty) })
    const result = yield* closed.watch(target).pipe(Stream.runDrain, Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("UnexpectedEof")
    const error = PlatformError.systemError({ module: "Test", method: "watch", _tag: "Unknown" })
    const failed = Watchman.make(fs, path, { register: () => Option.some(Stream.fail(error)) })
    const failure = yield* failed.watch(target).pipe(Stream.runDrain, Effect.result)
    expect(failure._tag).toBe("Failure")
    if (failure._tag === "Failure") expect(failure.failure).toBe(error)
  })).pipe(Effect.provide(base)))
})

test("file ignores are parent-relative with and without followReplacements", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* temporary(fs)
    const target = directory + "/config.log"
    yield* fs.writeFileString(target, "before")
    const watched = Watchman.make(fs, path, { register: () => Option.some(Stream.fromArray<FileSystem.WatchEvent>([
      { _tag: "Remove", path: "config.log" }, { _tag: "Update", path: target }
    ])) })
    for (const followReplacements of [false, true]) {
      const events: Array<FileSystem.WatchEvent> = []
      const result = yield* watched.watch(target, { ignore: ["**/*.log"], followReplacements }).pipe(
        Stream.runForEach((event) => Effect.sync(() => events.push(event))), Effect.result
      )
      expect(events).toEqual([])
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("UnexpectedEof")
    }
  })).pipe(Effect.provide(base)))
})

test("backend is captured at real Node filesystem construction and also usable directly", async () => {
  const calls: Array<string> = []
  const backend = Layer.succeed(FileSystem.WatchBackend, { register: (target, _info, options) => {
    calls.push(`${target}:${options?.recursive}`)
    return Option.some(Stream.succeed<FileSystem.WatchEvent>({ _tag: "Update", path: "nested/file" }))
  } })
  const native = NodeFileSystem.layer.pipe(Layer.provide(backend))
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const target = yield* temporary(fs)
    const result = yield* fs.watch(target, { recursive: true }).pipe(Stream.runCollect)
    expect(result.map((event) => event.path)).toEqual(["nested/file"])
    expect(calls).toEqual([`${target}:true`])
  })).pipe(Effect.provide(native)))
  const enhanced = Watchman.fromBackend.pipe(Layer.provide(Layer.mergeAll(native, NodePath.layer, backend)))
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* Watchman.fileSystem
    const target = yield* temporary(fs)
    const result = yield* fs.watch(target, { recursive: true, ignore: ["ignored"] }).pipe(Stream.take(1), Stream.runCollect)
    expect(result.map((event) => event.path)).toEqual(["nested/file"])
    expect(calls.length).toBe(2)
  })).pipe(Effect.provide(enhanced)))
})

test("one backend owner, independent stream scopes; releasing a sibling leaves the other alive", async () => {
  const owners = new Set<number>()
  const acquired: Array<string> = []
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const target = yield* temporary(fs)
    const firstReady = yield* Deferred.make<void>()
    const secondReady = yield* Deferred.make<void>()
    const backend = Layer.effect(FileSystem.WatchBackend, Effect.gen(function*() {
      yield* Effect.acquireRelease(Effect.sync(() => acquired.push("acquired")), () => Effect.sync(() => acquired.push("released")))
      return { register: () => Option.some(Stream.unwrap(Effect.gen(function*() {
        const id = owners.has(1) ? 2 : 1
        yield* Effect.acquireRelease(Effect.sync(() => owners.add(id)), () => Effect.sync(() => owners.delete(id)))
        yield* Deferred.succeed(id === 1 ? firstReady : secondReady, undefined)
        return Stream.fromEffect(Effect.never)
      }))) }
    }))
    const native = NodeFileSystem.layer.pipe(Layer.provide(backend))
    const enhanced = Watchman.fromBackend.pipe(Layer.provide(Layer.mergeAll(native, NodePath.layer, backend)))
    yield* Effect.gen(function*() {
      const watched = yield* Watchman.fileSystem
      const first = yield* watched.watch(target, { ignore: [] }).pipe(Stream.runDrain, Effect.forkScoped)
      yield* Deferred.await(firstReady).pipe(Effect.timeout("2 seconds"))
      yield* watched.watch(target, { ignore: [] }).pipe(Stream.runDrain, Effect.forkScoped)
      yield* Deferred.await(secondReady).pipe(Effect.timeout("2 seconds"))
      expect(acquired).toEqual(["acquired"])
      expect(owners.size).toBe(2)
      yield* Fiber.interrupt(first)
      expect([...owners]).toEqual([2])
    }).pipe(Effect.scoped, Effect.provide(enhanced))
  })).pipe(Effect.provide(base)))
  expect(owners.size).toBe(0)
  expect(acquired).toEqual(["acquired", "released"])
})

test("unenhanced filesystem is not silently accepted", async () => {
  const result = await Effect.runPromise(Watchman.fileSystem.pipe(Effect.result, Effect.provide(base)))
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("BadArgument")
})

test("v1 capability is rejected rather than accepting literal-only ignores", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const original = yield* FileSystem.FileSystem
    const fs = { ...original, "~effect-watch/options/v1": true }
    expect(Watchman.supports(fs)).toBe(false)
    const result = yield* Watchman.fileSystem.pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.result)
    expect(result._tag).toBe("Failure")
  }).pipe(Effect.provide(base)))
})
