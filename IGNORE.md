# Ignore contract — options/v2

Both independent providers promise `~effect-watch/options/v2: true`. Checked
accessors return the same Effect FileSystem object and reject missing/v1 markers
with `PlatformError/BadArgument`. There is no global module augmentation.

`ignore` is an OR-list of exclusions, compiled **once per consumed subscription**
with exact runtime dependency **minimatch 10.0.3**. Filtering uses only event paths,
including Remove tombstones; it does not stat or check existence. Watchman uses
userland filtering, not daemon pushdown. Event paths themselves are unchanged.

## Syntax and anchors

- Directory watches use paths relative to the requested directory, including
  nested watch roots. File watches use paths relative to their parent, whether or
  not `followReplacements` is enabled. File selection still limits that option to
  the requested basename; ignoring it yields no ordinary hints.
- Matching is case-sensitive and includes dotfiles. No basename-anywhere mode:
  `*.log` matches one segment; `**/*.log` matches at any depth. `*` and `?` do not
  cross separators; `**` as a whole segment matches zero or more segments.
  Brace alternatives/ranges and character classes follow minimatch 10.0.3.
- Patterns containing none of `* ? [ ] { }` are **literal subtrees**: `cache`
  excludes `cache` and `cache/...`, not `cache-sibling`. Patterns containing any
  of these characters are **whole-relative-path globs**, with no implicit subtree
  expansion or directory stat. `cache/*` excludes immediate entries, not
  `cache/deep/file`. A glob matching a directory entry does not prune descendants.
- `**/{node_modules,.git}/**` excludes descendants at any depth, **not the
  directory entry itself**. To exclude those entries too, add
  `**/{node_modules,.git}`. OpenCode's current list
  `["node_modules", ".git", "**/{node_modules,.git}/**"]` covers root entries
  through its literals and nested contents through its glob.
- `/` and `\` in patterns are separators on every host. Empty/repeated separator
  segments, trailing separators, and literal `.` segments normalize away before
  compilation. Windows event separators normalize when the supplied Path service
  uses `\`; POSIX event backslashes remain filename characters. Absolute and
  relative event paths normalize through the provider's Path service first.
- Backslash is **not an escape**. Use character classes for literal metacharacters:
  `file[*].txt` matches the exact name `file*.txt`; append `/**`
  (i.e. `file[*].txt/**`) for descendants. There is no literal-mode flag.
- Empty/root-equivalent patterns, absolute paths (including Windows drive and
  UNC/rooted spellings), any `..` segment, and leading `!` fail with BadArgument
  before registration. Brace expansions producing absolute/parent paths also
  fail. Even an in-root expression such as `a/../b` is rejected, not simplified.
- Unmatched/malformed braces or character classes use minimatch's literal
  fallback; they are **accepted**, not syntax errors. They remain exact-path
  patterns under the character-based classification above, not literal subtrees.
  Leading `#` is a filename, not a comment. Extglobs are disabled (`noext`);
  parentheses and `@`/`+` have no extglob grouping meaning.

This is **not gitignore**: no ordered reinclude, negation, comments, leading-slash
anchoring, directory-only slash convention, or Parcel compatibility claim.
Patterns are trusted application configuration, not a sandbox for hostile glob
expansion. Tests cover POSIX/Windows Path matching; live backends are tested on
Linux, not native Windows.
