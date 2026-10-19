import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { glob } from "glob"
import { join } from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Glob, Watchman } from "../effect-watchman.js"
import { selection } from "../src/Selection.js"
import { patterns, populate } from "./enumeration-cases.js"

const binary = process.env.WATCHMAN_TEST_BINARY
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("planner retains selective simple globs and widens extglobs/classes without losing prefixes", () => {
  expect(selection({ root: "/root", patterns: ["src/**/*.ts"] }).candidates).toEqual(["src/**/*.ts"])
  expect(selection({ root: "/root", patterns: ["src/@(a|b).[jt]s"] }).candidates).toEqual(["src/*"])
  expect(selection({ root: "/root", patterns: ["{src,test}/**/*.ts"] }).candidates).toEqual(["src/**/*.ts", "test/**/*.ts"])
  expect(() => selection({ root: "/root", patterns: ["{src,..}/**"] })).toThrow()
})

test.skipIf(!binary)("private daemon: glob residual conformance, selective pushdown, ignored subtrees and followed aliases", async () => {
  const scratch = await mkdtemp("/tmp/opencode/enumeration-live-")
  const root = join(scratch, "root")
  const external = join(scratch, "outside")
  const socketPath = join(scratch, "daemon.sock")
  await populate(root, external)
  await writeFile(join(scratch, "global.json"), "{}")
  const daemon = spawn(binary ?? "", ["--foreground", "--no-save-state", "--no-site-spawner", `--unix-listener-path=${socketPath}`, `--statefile=${scratch}/state`, `--pidfile=${scratch}/pid`, `--logfile=${scratch}/log`], {
    env: { ...process.env, WATCHMAN_CONFIG_FILE: join(scratch, "global.json"), WATCHMAN_SOCK: "" }, stdio: "ignore"
  })
  const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()))
  try {
    const deadline = Date.now() + 5000
    while (!existsSync(socketPath)) { if (Date.now() > deadline) throw new Error("Private daemon failed to listen"); await pause(10) }
    const filesystem = Watchman.layerWithGlob({ socketPath, approvedRoots: [root] }).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))
    await Effect.runPromise(Effect.gen(function*() {
      const fs = yield* Glob.fileSystem
      for (const pattern of patterns) {
        const actual = yield* fs.glob(pattern, { root })
        const expected = yield* Effect.promise(async () => {
          return (await glob(pattern, { cwd: root })).filter((name) => !name.startsWith("alias/") && !name.startsWith("external/"))
        })
        // Explicit literal traversal excludes link descendants. Node sometimes
        // traverses one level even with its default non-follow behavior.
        expect([...actual].sort(), pattern).toEqual(expected.sort())
      }
      const broad = yield* fs.enumerate({ root, patterns: ["**/*.ts"], dot: true, symlinks: "follow", kind: "files" })
      expect(broad.kind).toBe("scanned")
      expect(broad.entries.map((entry) => entry.path)).toEqual(expect.arrayContaining([".root.ts", "src/.dot.ts", "alias/a.ts", "external/external.ts", "ignored/inside.ts", ".git/objects/deep/object.ts", "link.ts"]))
      expect(broad.entries.some((entry) => entry.path === "broken")).toBe(false)
      const followed = yield* Effect.promise(() => glob("**/*.ts", { cwd: root, dot: true, follow: true, nodir: true }))
      expect(broad.entries.map((entry) => entry.path).sort()).toEqual(followed.sort())
      const excluded = yield* fs.enumerate({ root, patterns: ["**/*"], dot: true, exclude: ["src", "alias/**", ".git/**"], symlinks: "follow" })
      expect(excluded.entries.some((entry) => entry.path.startsWith("src/") || entry.path.startsWith("alias/") || entry.path.startsWith(".git/"))).toBe(false)
      const checkpoint = yield* fs.enumerate({ root, patterns: ["src/*.ts"], coverage: "daemon", metadata: true })
      expect(checkpoint.kind).toBe("checkpointed")
      expect(checkpoint.entries.map((entry) => entry.path)).toEqual(["src/a.ts"])
      expect(checkpoint.entries[0]?.size).toBeGreaterThan(0)
      const limited = yield* fs.enumerate({ root, patterns: ["ignored/**"], coverage: "daemon" })
      expect(limited.entries).toEqual([])
      const nested = yield* fs.enumerate({ root: join(root, "src"), patterns: ["**/*.ts"] })
      expect(nested.entries.map((entry) => entry.path)).toEqual(["a.ts", "deep/c.ts"])
      const directories = yield* fs.enumerate({ root, patterns: ["*"], kind: "directories" })
      expect(directories.entries.map((entry) => entry.path)).toEqual(expect.arrayContaining(["empty", "src", "alias", "external", "ignored"]))
      const nocase = yield* fs.glob("root.ts", { root, nocase: true })
      expect(nocase).toEqual(["root.ts", "ROOT.TS"])
      const denied = yield* fs.enumerate({ root: external }).pipe(Effect.result)
      expect(denied._tag).toBe("Failure")
      yield* Effect.promise(() => symlink(".", join(root, "cycle")))
      const cycled = yield* fs.enumerate({ root, patterns: ["**/*.ts"], symlinks: "follow", kind: "files" })
      expect(cycled.entries.some((entry) => entry.path.startsWith("cycle/"))).toBe(false)
      yield* Effect.promise(async () => {
        await mkdir(join(root, "large"))
        const names = Array.from({ length: 8000 }, (_, index) => `${String(index).padStart(5, "0")}-${"n".repeat(130)}.ts`)
        // Bounded fixture writes, not thousands of process spawns.
        for (let offset = 0; offset < names.length; offset += 100) {
          await Promise.all(names.slice(offset, offset + 100).map((name) => writeFile(join(root, "large", name), "")))
        }
      })
      const large = yield* fs.enumerate({ root, patterns: ["large/*.ts"], coverage: "daemon" })
      expect(large.entries).toHaveLength(8000)
      expect(JSON.stringify(large.entries).length).toBeGreaterThan(1024 * 1024)
    }).pipe(Effect.provide(filesystem)))
    // Exact acquisition never asks watch-project to find a broader root.
    const log = await readFile(join(scratch, "log"), "utf8")
    expect(log).not.toContain("fatal")
  } finally {
    daemon.kill("SIGTERM")
    await Promise.race([exited, pause(1000)])
    if (daemon.exitCode === null) { daemon.kill("SIGKILL"); await exited }
    await rm(scratch, { recursive: true, force: true })
  }
}, 20_000)
