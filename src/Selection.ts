import { GLOBSTAR, Minimatch } from "minimatch"
import type { Entry, Request } from "./Enumeration.js"

/** One dialect for daemon residuals and explicit local supplements. */
export function selection(request: Request) {
  const compile = (input: string, dot: boolean) => {
    if (!input || input.includes("\0") || input.startsWith("/") || /^[A-Za-z]:/.test(input)) throw new Error("Patterns must be nonempty root-relative paths")
    const pattern = input.replace(/^(?:\.\/)+/, "")
    const matcher = new Minimatch(pattern, {
      dot, nocase: request.nocase ?? false, nonegate: true, nocomment: true,
      optimizationLevel: 0, platform: "linux"
    })
    if (matcher.globSet.some((part) => part.startsWith("/") || part.split("/").includes(".."))) throw new Error("Brace-expanded patterns must stay within the root")
    return matcher
  }
  const includes = (request.patterns ?? ["**/*"]).map((pattern) => compile(pattern, request.dot ?? false))
  const excludes = (request.exclude ?? []).map((pattern) => compile(pattern, true))
  const matches = (matcher: Minimatch, name: string, directory: boolean) => matcher.match(name === "." ? "" : name) || (name === "." && matcher.match(".")) ||
    (directory && matcher.match(name === "." ? "" : name + "/"))
  const excluded = (name: string, directory: boolean) => {
    const parts = name.split("/")
    return excludes.some((matcher) => matches(matcher, ".", true) || matches(matcher, name, directory) ||
      parts.slice(0, -1).some((_, index) => matches(matcher, parts.slice(0, index + 1).join("/"), true)))
  }
  const mayDescend = (name: string) => !excluded(name, true) && includes.some((matcher) => name === "." || matcher.match(name, true))
  const accepts = (entry: Entry) => {
    const directory = entry.type === "Directory" || entry.targetType === "Directory"
    if (excluded(entry.path, directory) || !includes.some((matcher) => matches(matcher, entry.path, directory))) return false
    if (request.kind === "files") return entry.type === "File" || entry.targetType === "File"
    if (request.kind === "directories") return directory
    if (request.kind === "non-directories") return !directory
    return true
  }
  // Every dynamic segment outside the verified wildmatch subset widens to '*'.
  // Brace alternatives are already expanded by minimatch. No subset pushdown.
  const globs = includes.flatMap((matcher) => matcher.set.map((parts, row) => parts.map((part, index) => {
    if (part === GLOBSTAR) return "**"
    if (typeof part === "string") return request.nocase && /[^0-9._ -]/.test(part) ? "*" : part.replace(/[\\*?\[\]]/g, "\\$&")
    const raw = matcher.globParts[row]?.[index] ?? "*"
    // Watchman wildmatch is byte-oriented; JS '?' may match a Unicode unit.
    // Widen question marks while retaining useful literal prefixes/suffixes.
    if (request.nocase) return "*"
    if (/^[a-zA-Z0-9._*? -]+$/.test(raw)) return raw.replaceAll("?", "*").replace(/\*+/g, "*")
    // Opaque magic still has mandatory literal edges (e.g. @(a|b).ts).
    return (raw.match(/^[a-zA-Z0-9._ -]+/)?.[0] ?? "") + "*" + (raw.match(/[a-zA-Z0-9._ -]+$/)?.[0] ?? "")
  }).join("/").replace(/\/$/, "")))
  const candidates = [...new Set(globs.flatMap((glob) => {
    // '**' matches zero components too; Watchman need not emit the prefix dir.
    return glob.endsWith("/**") ? [glob, glob.slice(0, -3)] : [glob]
  }).filter(Boolean))]
  const links = [...new Set(candidates.flatMap((glob) => {
    const parts = glob.split("/")
    const star = parts.indexOf("**")
    return (star < 0 ? parts : parts.slice(0, star + 1)).map((_, index) => parts.slice(0, index + 1).join("/"))
  }))]
  const literalExcludes = request.nocase ? [] : excludes.flatMap((matcher) => matcher.set.flatMap((parts) =>
    parts.every((part): part is string => typeof part === "string") ? [parts.filter(Boolean).join("/")].filter((name) => name && name !== ".") : []))
  return { accepts, mayDescend, excluded, candidates, links, literalExcludes }
}

export function safeName(name: string) {
  if (!name || name.includes("\0") || name.startsWith("/") || name.split("/").some((part) => part === ".." || part === "." || part === "")) throw new Error("Provider returned an escaping or non-canonical path")
  return name
}
