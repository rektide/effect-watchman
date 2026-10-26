import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { walk } from "../src/Local.js"

// POSIX permissions make an unnecessary readdir observable without mocking fs.
test.skipIf(process.platform === "win32" || process.getuid?.() === 0)("fixed-depth supplements retain the directory without reading its children", async () => {
  const root = await mkdtemp("/tmp/opencode/watchman-local-")
  const child = join(root, "ignored")
  await mkdir(child)
  await writeFile(join(child, "unrequested.txt"), "not part of the shallow listing")
  await chmod(child, 0o000)
  try {
    for (const starts of [["."], ["ignored"]]) {
      const entries = await walk({ root, patterns: ["*"], dot: true, kind: "all", symlinks: "literal" }, starts, new AbortController().signal)
      expect(entries.filter((entry) => entry.path !== ".")).toEqual([{ path: "ignored", type: "Directory" }])
    }
  } finally {
    await chmod(child, 0o755)
    await rm(root, { recursive: true, force: true })
  }
})
