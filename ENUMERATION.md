---
type: APIReference
title: Watchman glob and enumeration
description: Approved-root daemon selection, npm-compatible traversal, explicit local supplementation, and complete baselines.
resource: /ENUMERATION.md
status: implemented
author: GPT-6.1 Sol xhigh
date: 2026-10-28
sources:
  - resource: "opencode://ses_e7c90f1d6ffeviS28mp5Msdsk1"
    title: Clarify selectable JSON/BSER wire-payload budget semantics and preserve operation-local query failures; connect current owner recovery documentation
  - resource: "opencode://ses_e86321c9effeBsU4Tba8JL11k2"
    title: Bound fixed-depth local supplementation before child reads for OpenCode skill directory discovery; verify with a permission boundary and the library suite
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Enumeration implementation, real daemon verification, wide-directory review correction and explicit nodir limits
  - resource: /src/Enumeration.ts
    title: Structural consumer contract shared with independent Plus
  - resource: /src/GlobBackend.ts
    title: Candidate queries, budgets, coverage supplementation and checkpoint classification
  - resource: /src/GlobView.ts
    title: npm traversal over the daemon-backed candidate directory view
  - resource: /test/enumeration.test.ts
    title: Private daemon conformance and greater-than-1-MiB baseline fixture
  - resource: /test/query-transport.test.ts
    title: Query decoding, cancellation ownership and healthy sibling tests
  - resource: /design/watch/baseline-enumeration0.sol61x.md
    title: Baseline implementation proposal and later continuity boundary
---

# Glob and enumeration

```ts
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Glob, Watchman } from "effect-watchman"

const filesystem = Watchman.layerWithGlob({
  socketPath: "/private/watchman.sock",
  approvedRoots: ["/work/project"]
}).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))

const program = Effect.gen(function*() {
  const fs = yield* Glob.fileSystem
  const names = yield* fs.glob(".opencode/{agents,skills}/**/*.md", {
    root: "/work/project", dot: true, symlinks: "follow"
  })
  const baseline = yield* fs.enumerate({
    root: "/work/project", patterns: ["src/**/*.{ts,tsx}"],
    kind: "files", exclude: ["node_modules"], symlinks: "glob"
  })
  return { names, baseline }
}).pipe(Effect.provide(filesystem))
```

`Watchman.layer` remains watch-only. `Glob.layer(options)` replaces glob and adds
enumerate, without replacing watch. `Watchman.layerWithGlob(options)` constructs
**one connection and one approved-root acquisition cache** for both projections.
Use `Watchman.fileSystem` for enhanced watch option typing and `Glob.fileSystem`
for enumeration typing; both access the same filesystem object. No Plus runtime
is installed. The marker is `~effect-watch/enumeration/v1`, not watch options/v2.

## Matching and selection

`enumerate` requires an absolute root. Missing descendant roots (or non-directory
roots) inside approval return an empty scanned baseline by explicit preflight;
this is not query-error fallback. Results are slash-separated lexical names
relative to that root; `.` denotes the root itself when matched. `glob` additionally
allows an omitted/relative root (resolved against process cwd), but that directory must still be
inside approval. Absolute/parent-escaping patterns are not accepted. Output is
deduplicated and sorted; ordering is not Node's traversal order.

Patterns use minimatch 10 / npm glob 13: braces, classes, extglobs, globstar,
backslash escaping, explicit dot and nocase flags. Leading `!` and `#` are literal,
not negation/comment syntax. Excludes are whole-relative-path globs; matching a
directory prunes its descendants. There are no implicit watch ignores or Git
ignores in the literal profile. `policy:"gitignore"` fails here; explicitly choose
a ripgrep provider for that distinct profile.

Request defaults: patterns `["**/*"]`, dot/nocase/metadata false, kind `all`,
coverage `filesystem`, symlinks `literal`. The **glob method** defaults symlinks
to `glob`, matching npm traversal rather than promising every Node glob quirk.

| Option | Meaning |
|---|---|
| `kind:"all"` | Files, directories, links (including broken links), other entries |
| `kind:"files"` | Regular files and links resolving to regular files |
| `kind:"directories"` | Directories and links resolving to directories |
| `kind:"non-directories"` | Everything except directories and links resolving to directories; useful for discovery `nodir`, retaining broken links and special entries |
| `symlinks:"literal"` | Never descend into directory links, even a literal pattern prefix |
| `symlinks:"glob"` | npm's default pattern-dependent traversal, including literal symlink prefixes and its bounded globstar behavior |
| `symlinks:"follow"` | Recursively traverse linked directories; ancestor real-directory identities stop cycles without suppressing independent aliases |
| `metadata:true` | Request lexical `size` and `mtimeMs`; sparse metadata is not Effect File.Info or a content snapshot |

`non-directories` is not an exact synonym for npm `nodir` in every link mode:
with `follow:false` (our `symlinks:"glob"` traversal), npm can retain a literal
directory symlink, while this kind always excludes links resolving to directories.
Applications requiring that exact npm classification should enumerate `all` and
apply their declared link-mode-specific selection explicitly.

Names-only daemon enumeration requests name/type, not stat per regular result.
Symlinks are locally classified for target kind. `glob` mode uses the real npm
traversal engine over a directory view made from daemon candidates and their
ancestor paths. Its native readdir is allowed only through symlink paths; daemon
directories use the supplied view, not an undisclosed second native tree walk.
Simple globs retain their full selective daemon generator. Braces expand;
unproven class/extglob components widen to single-component candidates, with
residual selection. Literal excludes also push down. Nocase widens conservatively.

## Acquisition and coverage

`approvedRoots` is required and nonempty. Roots must exist and be absolute.
The manager acquires the nearest enclosing **exact approved root with `watch`**,
never `watch-project` followed by an after-the-fact boundary check. Nested requests
use relative_root. Outside-root requests fail; they do not start a home/root watch.
Symlink targets are never implicitly approved as new daemon roots.

Default `coverage:"filesystem"` reads the daemon's effective root config and
explicitly supplements potentially matching ignore_dirs/ignore_vcs subtrees.
Those walks are limited by the declared selection. Symlink targets can be native
supplements too. If the requested root itself is a symlink below approval pointing
outside it, that root is explicitly enumerated locally, without watching its target.
This is a scanned Watchman-provider baseline, not a daemon checkpoint.

Fixed-depth patterns stop local supplementation at their maximum pathname depth:
`patterns:["*"]` returns immediate lexical entries (including an ignored directory
itself) without reading those directories' children. The daemon generator is also
`glob:["*"]`, not a recursive inventory filtered afterward. This does not eliminate
native metadata reads, link target classification or explicitly required supplements.

`coverage:"daemon"` explicitly accepts configured daemon scope. It does not recover
ignored subtrees and is not a complete filesystem inventory. A symlink-root outside
approval has no daemon coverage and fails this profile. The implementation does
not rewrite daemon config, unwatch roots, retry failed queries with native scans,
or reconnect automatically.

## Baseline guarantees and budgets

Every success has `complete:true`, source, declared coverage, and entries. There
is no successful truncated baseline. Query-only results use `kind:"checkpointed"`
with an opaque owner-bound token; any local membership/metadata supplementation
uses `kind:"scanned"`. Tokens do **not** yet expose catch-up or subscription alignment.
Scans describe an interval, not an atomic filesystem transaction. Daemon snapshots
are synchronized views; a fresh-instance full query is normal, not an error.

Enumeration defaults: 64 MiB shared frame ceiling, 32 MiB per-query result ceiling,
30s query sync and 30s lock budgets, 65s queue and on-wire query deadlines. Explicit
queryTimeoutMs must exceed querySyncTimeoutMs + queryLockTimeoutMs. The ordinary
watch-only layer retains its prior 1 MiB/3s defaults. Options expose maxFrameBytes,
maxQueryBytes, queueTimeoutMs and the three query timeout fields. Daemon query
responses are whole arrays, not wire-streamed or paginated. Local supplementary
result arrays have normal native-glob memory cost; maxQueryBytes bounds daemon
reply bytes, not those arrays.
`wireFormat` selects JSON by default or opt-in BSER without changing the returned
enumeration interface. Both ceilings count encoded payload bytes, excluding JSON's
LF delimiter or BSER's v1 header. Budgets are therefore representation-dependent,
not a portable decoded-size bound. See the [wire choices and strictness warning](README.md#wire-backend-choice).

A complete oversized query reply exceeding maxQueryBytes fails that operation
without destroying siblings; exceeding the shared framing ceiling, wire silence,
disconnect or corrupt wire encoding is terminal (fatal UTF-8 remains JSON-only;
BSER currently decodes strings lossily). Schema/query errors and daemon crawl warnings
(including permission-denied subtrees) fail rather than being
decoded through the subscription schema. Canceled transmitted queries retain wire
ownership and their deadline, so their late reply cannot be mistaken for a sibling
command's response. Queries serialize with watch commands; no transport pool or
query retry is hidden underneath the API. Later operations may use the shared
[recovered owner](RECOVERY.md#shared-lifecycle-and-health).

## Limits

Literal scope is path-only: no Git-ignore matcher, remote placement, absolute or
parent-segment glob support. Native supplements require the daemon's filesystem
to be the caller's local filesystem. No aligned changes/catch-up, content atomicity,
portable checkpoint serialization or promise of exact Node fs.glob behavior.
In particular npm and Node differ around root/dot patterns and symlink traversal.
Applications should select this dialect explicitly when adapting npm discovery.

The private daemon tests exercise npm-oracle matching, literal-prefix links,
followed external links, dotfiles, exclusions, relative roots, configured omissions,
directory and broken-link membership, cycles and a baseline exceeding the previous
1-MiB frame limit. Scripted peer tests prove one exact acquisition, rich/name-only
query decoding, result-byte rejection and canceled-query/sibling-watch isolation.
The identical consumer in each package's test/consumer.ts also runs with native
and caller-spawned ripgrep providers.

See the [verification receipt](design/watch/enumeration-verification0.sol61x.md)
for exact revisions, checks, real Node differences and test-scope limits.
The [contract checkpoint](design/watch/enumeration-contract0.sol61x.md) records the
structural boundary; the [baseline proposal](design/watch/baseline-enumeration0.sol61x.md)
describes the subsequent aligned-continuity work.
