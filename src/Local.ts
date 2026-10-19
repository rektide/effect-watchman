import { lstat, readdir, realpath, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { join, resolve } from "node:path"
import type { Entry, Request } from "./Enumeration.js"
import { selection } from "./Selection.js"

const classify = (info: Awaited<ReturnType<typeof lstat>>): Entry["type"] => info.isSymbolicLink() ? "SymbolicLink" : info.isDirectory() ? "Directory" : info.isFile() ? "File" : "Other"

/** Classify only links or explicitly requested metadata, not every daemon name. */
export async function localEntry(root: string, name: string, metadata: boolean): Promise<Entry> {
  // The namespace root is a directory even when its spelling is a symlink.
  const info = await lstat(name === "." ? root + "/." : resolve(root, name))
  const type = classify(info)
  const target = type === "SymbolicLink" ? await stat(resolve(root, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "ELOOP") return undefined
    throw error
  }) : undefined
  return {
    path: name, type, ...(target ? { targetType: classify(target) === "Directory" ? "Directory" : target.isFile() ? "File" : "Other" } : {}),
    ...(metadata ? { size: info.size, mtimeMs: info.mtimeMs } : {})
  }
}

/** Explicit candidate-root walk. Ancestor identities prevent cycles, not aliases. */
export async function walk(request: Request, starts: ReadonlyArray<string>, signal: AbortSignal): Promise<Array<Entry>> {
  const matcher = selection(request)
  const entries = new Map<string, Entry>()
  const visit = async (name: string, ancestors: ReadonlySet<string>, known?: Dirent): Promise<void> => {
    signal.throwIfAborted()
    const entry: Entry = known && !known.isSymbolicLink() && !request.metadata
      ? { path: name, type: known.isDirectory() ? "Directory" : known.isFile() ? "File" : "Other" }
      : await localEntry(request.root, name, request.metadata ?? false)
    entries.set(name, entry)
    const directory = entry.type === "Directory" || ((name === "." || request.symlinks === "follow") && entry.targetType === "Directory")
    if (!directory || !matcher.mayDescend(name)) return
    const identity = await realpath(resolve(request.root, name))
    if (ancestors.has(identity)) return
    const chain = new Set([...ancestors, identity])
    for (const child of await readdir(resolve(request.root, name), { withFileTypes: true })) {
      await visit(name === "." ? child.name : name + "/" + child.name, chain, child)
    }
  }
  const rootIdentity = await realpath(request.root)
  for (const start of starts) {
    // Include all lexical ancestors so a followed link back to the root stops.
    const parents = start === "." ? [] : start.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))
    const identities = await Promise.all(parents.map((name) => realpath(join(request.root, name))))
    await visit(start, new Set(start === "." ? [] : [rootIdentity, ...identities]))
  }
  return [...entries.values()]
}
