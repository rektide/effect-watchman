import { Minimatch } from "minimatch"
import { Path } from "effect"

export interface IgnoreOptions {
  readonly ignore?: ReadonlyArray<string> | undefined
  readonly defaultIgnores?: boolean | undefined
}

/** Cookies from other watchers are filesystem noise, including below nested roots. */
export const defaultIgnores: ReadonlyArray<string> = ["**/.watchman-cookie-*", "**/.watchman-cookie-*/**"]

export function resolveIgnore(options?: IgnoreOptions, instance?: IgnoreOptions) {
  return [...new Set([
    ...((options?.defaultIgnores ?? instance?.defaultIgnores) === false ? [] : defaultIgnores),
    ...(instance?.ignore ?? []),
    ...(options?.ignore ?? [])
  ])]
}

/** Compiled once per consumed watch stream; matching never reads the filesystem. */
export function compileIgnore(patterns: ReadonlyArray<string>, path: Path.Path) {
  const excluded = patterns.map((input) => {
    // Backslash is a separator, never a glob escape (also on POSIX).
    const portable = input.replaceAll("\\", "/")
    if (path.isAbsolute(input) || portable.startsWith("/") || /^[A-Za-z]:/.test(portable) || portable.startsWith("!") || portable.split("/").includes("..")) {
      throw new Error("ignore patterns must be relative, non-negated and contain no parent segments")
    }
    const pattern = portable.split("/").filter((part) => part !== "" && part !== ".").join("/")
    if (!pattern) throw new Error("ignore patterns must be nonempty")
    const glob = ["*", "?", "[", "]", "{", "}"].some((character) => pattern.includes(character))
    const matcher = glob ? new Minimatch(pattern, {
      dot: true, nocase: false, nocomment: true, nonegate: true, noext: true,
      optimizationLevel: 0
    }) : undefined
    if (matcher?.globSet.some((expanded) => expanded.startsWith("/") || /^[A-Za-z]:/.test(expanded) || expanded.split("/").includes(".."))) {
      throw new Error("ignore brace alternatives must remain within the watch directory")
    }
    return { pattern, matcher }
  })
  return (relative: string) => {
    const name = path.sep === "\\" ? relative.replaceAll("\\", "/") : relative
    return excluded.some(({ pattern, matcher }) => matcher
      ? matcher.match(name)
      : name === pattern || name.startsWith(pattern + "/"))
  }
}
