import { lstat, readlink, readdir, realpath } from "node:fs/promises"
import type { Dirent, Stats } from "node:fs"
import { basename, dirname, relative, resolve, sep } from "node:path"
import { glob } from "glob"
import type { Entry, Request } from "./Enumeration.js"
import { localEntry } from "./Local.js"
import { selection } from "./Selection.js"

/** Local npm-compatible traversal is an explicit provider/supplement operation. */
export async function nativeGlob(request: Request, signal: AbortSignal): Promise<Array<Entry>> {
  const matcher = selection(request)
  let failure: unknown
  const guarded = async <A>(read: () => Promise<A>): Promise<A> => {
    signal.throwIfAborted()
    try { return await read() }
    catch (error) {
      if (!(error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(String(error.code)))) failure ??= error
      throw error
    }
  }
  const directory = (path: string) => guarded(() => readdir(path, { withFileTypes: true }))
  const names = await glob([...(request.patterns ?? ["**/*"])], {
    cwd: request.root, dot: request.dot ?? false, nocase: request.nocase ?? false, follow: false, signal,
    ignore: {
      ignored: (path) => matcher.excluded(path.relativePosix() || ".", path.isDirectory()),
      childrenIgnored: (path) => matcher.excluded(path.relativePosix() || ".", true)
    },
    fs: { readdir: (path, _, callback) => { directory(path).then((entries) => callback(null, entries), (error) => callback(error)) },
      promises: { readdir: directory, lstat: (path) => guarded(() => lstat(path)), readlink: (path) => guarded(() => readlink(path)), realpath: (path) => guarded(() => realpath(path)) } }
  })
  if (failure) throw failure
  const entries: Array<Entry> = []
  for (const name of names) {
    signal.throwIfAborted()
    const entry = await localEntry(request.root, name, request.metadata ?? false)
    if (matcher.accepts(entry)) entries.push(entry)
  }
  return entries
}

/** Run npm's own traversal rules against a candidate directory view. Only link
 * targets can perform native readdir; covered daemon directories never do. */
export async function globView(request: Request, candidates: ReadonlyArray<Entry>, signal: AbortSignal): Promise<Array<Entry>> {
  const matcher = selection(request)
  const entries = new Map(candidates.map((entry) => [entry.path, entry]))
  if (!entries.has(".")) entries.set(".", { path: ".", type: "Directory" })
  const links = candidates.filter((entry) => entry.type === "SymbolicLink").map((entry) => entry.path)
  for (const entry of candidates) {
    const parts = entry.path.split("/")
    for (let index = 1; index < parts.length; index++) {
      const name = parts.slice(0, index).join("/")
      if (!entries.has(name)) entries.set(name, { path: name, type: "Directory" })
    }
  }
  const children = new Map<string, Array<Entry>>()
  for (const entry of entries.values()) {
    if (entry.path === ".") continue
    const parent = dirname(entry.path)
    const siblings = children.get(parent)
    if (siblings) {
      siblings.push(entry)
      continue
    }
    children.set(parent, [entry])
  }
  const local = (name: string) => links.some((link) => name === link || name.startsWith(link + "/"))
  const nameOf = (path: string) => {
    const name = relative(resolve(request.root), resolve(path))
    if (name === ".." || name.startsWith(".." + sep)) throw new Error("Glob traversal escaped its root")
    return name ? (sep === "\\" ? name.replaceAll("\\", "/") : name) : "."
  }
  const missing = () => Object.assign(new Error("No candidate entry"), { code: "ENOENT" })
  let failure: unknown
  const guarded = async <A>(read: () => Promise<A>): Promise<A> => {
    signal.throwIfAborted()
    try { return await read() }
    catch (error) {
      if (!(error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(String(error.code)))) failure ??= error
      throw error
    }
  }
  const directory = (path: string): Promise<Array<Dirent>> => guarded(async () => {
    const name = nameOf(path)
    if (local(name)) return readdir(path, { withFileTypes: true })
    const parent = entries.get(name)
    if (parent?.type !== "Directory") throw missing()
    return (children.get(name) ?? []).map((entry) => dirent(entry, path))
  })
  const info = (path: string): Promise<Stats> => guarded(async () => {
    const name = nameOf(path)
    if (local(name)) return lstat(path)
    const entry = entries.get(name)
    if (!entry) throw missing()
    return stats(entry)
  })
  const names = await glob([...(request.patterns ?? ["**/*"])], {
    cwd: request.root, dot: request.dot ?? false, nocase: request.nocase ?? false,
    follow: false, signal,
    ignore: {
      ignored: (path) => matcher.excluded(path.relativePosix() || ".", path.isDirectory()),
      childrenIgnored: (path) => matcher.excluded(path.relativePosix() || ".", true)
    },
    fs: {
      readdir: (path, _, callback) => { directory(path).then((entries) => callback(null, entries), (error) => callback(error)) },
      lstatSync: () => { throw new Error("Unexpected synchronous glob read") },
      readdirSync: () => { throw new Error("Unexpected synchronous glob read") },
      readlinkSync: () => { throw new Error("Unexpected synchronous glob read") },
      realpathSync: () => { throw new Error("Unexpected synchronous glob read") },
      promises: { lstat: info, readdir: directory,
        readlink: (path) => guarded(() => readlink(path)), realpath: (path) => guarded(() => realpath(path)) }
    }
  })
  if (failure) throw failure
  const selected: Array<Entry> = []
  for (const name of names) {
    signal.throwIfAborted()
    const entry = local(name) ? await localEntry(request.root, name, request.metadata ?? false) : entries.get(name)
    if (!entry) throw new Error("Glob returned a name outside the candidate view")
    if (matcher.accepts(entry)) selected.push(entry)
  }
  return selected
}

function dirent(entry: Entry, parentPath: string) {
  return {
    name: basename(entry.path), parentPath,
    isFile: () => entry.type === "File", isDirectory: () => entry.type === "Directory", isSymbolicLink: () => entry.type === "SymbolicLink",
    isBlockDevice: () => false, isCharacterDevice: () => false, isSocket: () => false, isFIFO: () => entry.type === "Other"
  }
}

function stats(entry: Entry): Stats {
  const date = new Date(entry.mtimeMs ?? 0)
  return {
    ...dirent(entry, ""), dev: 0, ino: 0, mode: 0, nlink: 1, uid: 0, gid: 0, rdev: 0,
    size: entry.size ?? 0, blksize: 4096, blocks: 0,
    atimeMs: 0, mtimeMs: entry.mtimeMs ?? 0, ctimeMs: 0, birthtimeMs: 0,
    atime: date, mtime: date, ctime: date, birthtime: date,
    atimeInstant: undefined, mtimeInstant: undefined, ctimeInstant: undefined, birthtimeInstant: undefined
  }
}
