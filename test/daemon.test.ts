import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Fiber, FileSystem, Layer, Stream } from "effect"
import { Watchman } from "../effect-watchman.js"

const binary = process.env.WATCHMAN_TEST_BINARY
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await pause(30)
  }
  throw new Error("Timed out waiting for daemon event")
}

test.skipIf(!binary)("private stock daemon: public backend and enhanced fs.watch lifecycle", async () => {
  const scratch = await mkdtemp(join(process.env.WATCH_TEST_DIRECTORY ?? "/home/rektide/tmp-opencode", "watchman-live-"))
  const root = join(scratch, "root")
  const socketPath = join(scratch, "daemon.sock")
  await mkdir(root)
  await writeFile(join(root, ".watchmanconfig"), "{}")
  await mkdir(join(root, "nested"))
  await mkdir(join(root, "ignored"))
  await writeFile(join(root, "config"), "original")
  const alias = join(scratch, "logical-alias")
  await symlink(root, alias)
  const env = { ...process.env }
  delete env.WATCHMAN_SOCK
  const daemon = spawn(binary ?? "", ["--foreground", "--no-save-state", "--no-site-spawner",
    `--unix-listener-path=${socketPath}`, `--statefile=${scratch}/state`, `--pidfile=${scratch}/pid`, `--logfile=${scratch}/daemon.log`], { env, stdio: "ignore" })
  const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()))
  try {
    await until(() => existsSync(socketPath))
    const backend = Watchman.backendLayer({ socketPath })
    const native = NodeFileSystem.layer.pipe(Layer.provide(backend))
    const enhanced = Watchman.fromBackend.pipe(Layer.provide(Layer.mergeAll(native, NodePath.layer, backend)))
    const recursive: Array<FileSystem.WatchEvent> = []
    const direct: Array<FileSystem.WatchEvent> = []
    const stable: Array<FileSystem.WatchEvent> = []
    const ordinary: Array<FileSystem.WatchEvent> = []
    const file: Array<FileSystem.WatchEvent> = []
    const logical: Array<FileSystem.WatchEvent> = []
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Watchman.fileSystem
      const first = yield* fs.watch(root, { recursive: true, ignore: ["ignored"] }).pipe(Stream.runForEach((event) => Effect.sync(() => recursive.push(event))), Effect.forkScoped)
      yield* fs.watch(root).pipe(Stream.runForEach((event) => Effect.sync(() => direct.push(event))), Effect.forkScoped)
      yield* fs.watch(join(root, "config"), { followReplacements: true }).pipe(Stream.runForEach((event) => Effect.sync(() => stable.push(event))), Effect.forkScoped)
      yield* fs.watch(join(root, "config")).pipe(Stream.runForEach((event) => Effect.sync(() => file.push(event))), Effect.forkScoped)
      yield* fs.watch(alias, { recursive: true }).pipe(Stream.runForEach((event) => Effect.sync(() => logical.push(event))), Effect.forkScoped)
      // Same public backend, independently constructed ordinary Node filesystem.
      yield* Effect.gen(function*() {
        const original = yield* FileSystem.FileSystem
        yield* original.watch(root, { recursive: true }).pipe(Stream.runForEach((event) => Effect.sync(() => ordinary.push(event))), Effect.forkScoped)
      }).pipe(Effect.provide(native))
      yield* Effect.sleep("400 millis")
      expect(recursive).toEqual([])
      expect(direct).toEqual([])
      expect(stable).toEqual([])
      yield* Effect.promise(async () => {
        await writeFile(join(root, "created"), "one")
        await until(() => recursive.some((event) => event._tag === "Create" && event.path === join(root, "created")))
        await until(() => logical.some((event) => event._tag === "Create" && event.path === join(alias, "created")))
        await writeFile(join(root, "created"), "two")
        await until(() => recursive.some((event) => event._tag === "Update" && event.path === join(root, "created")))
        await unlink(join(root, "created"))
        await until(() => recursive.some((event) => event._tag === "Remove" && event.path === join(root, "created")))
        await writeFile(join(root, "nested", "deep"), "nested")
        await until(() => recursive.some((event) => event.path.endsWith("/nested/deep")))
        await writeFile(join(root, "ignored", "hidden"), "hidden")
        await until(() => ordinary.some((event) => event.path.endsWith("/ignored/hidden")))
        await unlink(join(root, "ignored", "hidden"))
        await until(() => ordinary.some((event) => event._tag === "Remove" && event.path.endsWith("/ignored/hidden")))
        await writeFile(join(root, "replacement"), "replacement")
        await rename(join(root, "replacement"), join(root, "config"))
        await until(() => stable.length > 0)
        const count = stable.length
        await writeFile(join(root, "config"), "later edit")
        await until(() => stable.length > count)
        expect(stable.every((event) => event.path === join(root, "config"))).toBe(true)
        await until(() => file.length > 0)
        expect(file.every((event) => event.path === join(root, "config"))).toBe(true)
        expect(direct.some((event) => event.path.endsWith("/nested/deep"))).toBe(false)
        expect(recursive.some((event) => event.path.includes("/ignored/"))).toBe(false)
        await pause(200)
        const before = [recursive.length, direct.length, stable.length, ordinary.length]
        for (let i = 0; i < 5; i++) await readFile(join(root, "config"))
        await pause(300)
        expect([recursive.length, direct.length, stable.length, ordinary.length]).toEqual(before)
      })
      yield* Fiber.interrupt(first)
      const stopped = recursive.length
      yield* Effect.promise(async () => {
        await writeFile(join(root, "sibling-alive"), "alive")
        await until(() => direct.some((event) => event.path.endsWith("/sibling-alive")))
        expect(recursive.length).toBe(stopped)
      })
    })).pipe(Effect.provide(enhanced)))
  } finally {
    daemon.kill("SIGTERM")
    await Promise.race([exited, pause(2000)])
    if (daemon.exitCode === null) { daemon.kill("SIGKILL"); await exited }
    await rm(scratch, { recursive: true, force: true })
  }
}, 15000)
