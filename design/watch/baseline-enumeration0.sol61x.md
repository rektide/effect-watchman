---
type: ArchitectureReview
title: Additive glob backends and filesystem baselines
description: Extend Watch Plus and independent Watchman with native, ripgrep, and daemon enumeration without making an observation service mandatory.
resource: /design/watch/baseline-enumeration0.sol61x.md
status: proposal
author: GPT-6.1 Sol xhigh
date: 2026-10-13
sources:
  - resource: "opencode://ses_ecc383277ffey4GnptMHNf2ZPb"
    title: Architecture review of library ownership, enumeration contracts, Watchman query boundaries, and OpenCode adoption
  - resource: "opencode://ses_eccafdf67ffesc5ruV2dWuc2QE"
    title: Commission and current integration context supplied by the parent session
  - resource: /HANDOFF.md
    title: Independent Watchman's implemented seam and explicit continuity limits
  - resource: /src/Backend.ts
    title: Current connection, cached project acquisition, and subscription owner
  - resource: /src/Connection.ts
    title: Subscription-oriented decoding, serialized commands, cancellation, and frame limits
  - resource: "file:///home/rektide/src/effect-watch-plus/src/Watch.ts"
    title: Captured native decorator and caller-owned reconciliation helper
  - resource: "file:///home/rektide/src/effect-watch-plus/design/watch/contract.md"
    title: Accepted additive direction and optional richer-operation boundary
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/FileSystem.ts"
    title: Exact Effect 4.0.1 glob and WatchBackend signatures
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts"
    title: Exact native glob delegation, stat behavior, and captured watch backend
  - resource: "file:///home/rektide/archive/facebook/watchman/website/docs/file-query.md"
    title: In-memory generators, relative roots, and symlink limits
  - resource: "file:///home/rektide/archive/facebook/watchman/website/docs/cmd/query.md"
    title: Query result fields, clocks, fresh-instance behavior, and synchronization
  - resource: "file:///home/rektide/archive/facebook/watchman/watchman/query/eval.cpp"
    title: Generator union behavior and returned query clock
  - resource: "file:///home/rektide/src/opencode-working/packages/util/src/fs-util.ts"
    title: Discovery scans bypassing the injected Effect filesystem
  - resource: "file:///home/rektide/src/opencode-working/packages/core/src/ripgrep.ts"
    title: Location-spawned file enumeration, glob selection, truncation, and exit handling
  - resource: "file:///home/rektide/src/opencode-working/packages/core/src/filesystem/search.ts"
    title: Separate fuzzysort inventory and FFF initialization/feed ownership
  - resource: "file:///home/rektide/src/fff/crates/fff-core/src/file_picker.rs"
    title: Filesystem walk and downstream native index construction
  - resource: "file:///home/rektide/src/opencode-watchman/design/filesystem-watch/README.md"
    title: Maintained integration overview and delivered versus subsequent coverage
verification:
  method: Source inspection only; no implementation, build, daemon interaction, or live configuration change
---

# Additive glob backends and filesystem baselines

## Decision in brief

**Yes: add baseline/enumeration implementations to the existing libraries now.**
Watch Plus should own a native implementation and an optional ripgrep adapter;
Watchman should own its daemon query implementation. Keep ordinary `fs.glob`
available, and make stronger baseline-to-changes operations optional. This is an
extension of the additive direction, not a return to the mandatory observation
service rejected in the [additive gate](additive-gate.md).

The useful change is to let applications ask the selected provider for names and
baselines, not merely receive events and keep doing unrelated filesystem walks.
There is no need to start with TTL changes, another application inventory manager,
a replacement native watcher, or a new repository.

Recommended boundaries:

1. A small structural **`GlobBackend` / enumeration provider contract** shared by
   native, ripgrep, and Watchman implementations.
2. A separate additive glob/enumeration composition in Watch Plus. Its existing
   watch-only layer keeps its current behavior.
3. Watchman query and watch projections of **one scoped connection/root owner**.
4. Real baseline results in all three implementations: scanned baselines for
   native/ripgrep, checkpointed daemon baselines for Watchman.
5. An optional Watchman snapshot-and-subscribe/catch-up capability, with an opaque
   checkpoint, rather than clocks inserted into ordinary watch events.

For the first cut, retain the existing independent-package pattern: coordinated
structural types and versioned capability markers, with cross-provider consumer
tests. **Do not add a third npm package yet.** If shared executable planning or
schema code becomes substantial, extract one neutral leaf contract package then;
do not make standalone Watchman depend on the Plus watcher/policy runtime.

## Inspected ground and revisions

| Source | Inspected revision / status |
| --- | --- |
| `~/src/effect-watch-plus` | `9e63d2fe455123730f1e2090b5139bbb1774b646`; clean starting working copy |
| `~/src/effect-watchman` | `35ab91d2dff5ba3f523e8d68949702632f096a7e`; clean starting working copy |
| OpenCode library artifacts | Plus `56a17a8f`, Watchman `641214c7`, recorded in [vendor input receipt](file:///home/rektide/src/opencode-working/vendor/effect-watch/README.md) |
| OpenCode feature carrier | `effect-watch` parent `a3d5c08a`; [integration overview](file:///home/rektide/src/opencode-watchman/design/filesystem-watch/README.md) |
| Native FFF fork | `3dfc96f93bb752b888e64514fa4a30fc7906da94`, matching [consumed provenance](file:///home/rektide/src/opencode-working/vendor/fff/provenance.json) |
| Archived Watchman source/docs | `923b0935155590be54c0fc052fdca0201f8ebc4b` |

Source libraries are newer than OpenCode's pinned archives. A source extension
does not change the installed integration until its dependency snapshots are
deliberately refreshed. This review changes no production source or artifacts.

Exact Effect 4.0.1 already has
[`FileSystem.glob`](file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/FileSystem.ts),
lines 133–139:

```ts
glob(pattern, { root?, exclude? }): Effect<Array<string>, PlatformError>
```

Its [Node provider](file:///home/rektide/src/effect-watch-plus/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts),
lines 126–137, delegates to Node's glob with `cwd: root` and `exclude`.
There is a `WatchBackend` service, but **no corresponding injectable GlobBackend**
in that filesystem construction (lines 672–701). The supplied effect-smol
reference also has glob; the installed 4.0.1 source is the version authority here.

Current Plus [`make`](file:///home/rektide/src/effect-watch-plus/src/Watch.ts),
lines 65–108, replaces only watch. Current Watchman [`make`](../../src/Watch.ts),
lines 41–79, also replaces only watch. The shared `~effect-watch/options/v2`
marker proves enhanced *watch options*, not enumeration or coherent baselines.
Neither package has an enumeration implementation today.

## Contract: three capabilities, not one exaggerated guarantee

### Plain glob

Keep `fs.glob(pattern, { root, exclude })` as the common simple entrypoint.
A library-owned decorator can capture the base filesystem and replace glob;
no upstream Effect modification or new process-global service is required.
Capture dependencies at composition, as the watch implementations already do.

Do not silently apply Git ignores, search-specific VCS exclusions, or watch-only
instance ignores to ordinary glob. Preserve its pathname and matching contract,
or explicitly reject unsupported patterns/options. In particular, an ordinary
glob can match directories as well as files. An `rg --files` implementation is
not a complete substitute for that operation.

### Enumeration baseline

Add a richer checked view or explicit provider operation for applications that
need entry types, file-only selection, metadata, completeness, or a checkpoint.
Use a **separate enumeration marker**, not a stronger interpretation of options/v2.
Do not globally augment Effect's glob option type.

The contract can remain a few structural interfaces. Illustrative shape, not
compiling implementation or a finalized naming decision:

```ts
interface GlobBackend {
  // Explicit root and policy, unlike an implicitly ambient process cwd.
  enumerate(request: EnumerationRequest): Effect<Baseline, PlatformError>
  // Optional; native/ripgrep do not manufacture it.
  readonly continuity?: Continuity
}

type Baseline =
  | { readonly kind: "scanned"; readonly entries: readonly Entry[] }
  | {
      readonly kind: "checkpointed"
      readonly entries: readonly Entry[]
      readonly checkpoint: Checkpoint
    }

interface Continuity {
  catchUp(checkpoint: Checkpoint): Effect<Delta | ResetRequired, PlatformError>
  changes(checkpoint: Checkpoint): Stream<Delta, PlatformError>
}
```

The provider/checkpoint captures or binds the normalized request; a caller cannot
reuse it for a different root, include/exclude policy, or entry interpretation.
`Checkpoint` is opaque. No Watchman protocol arrays, clockspec parsing, or raw
daemon expressions need escape into OpenCode. The optional capability need not
be a new Effect service: it can be captured in a backend object supplied to the
composition/helper. An application may supply its own service key if useful.

The checked filesystem view can expose `enumerate` on the same object at
Effect's filesystem key, alongside ordinary glob. Independent Watchman can
implement that structural view without installing Plus's layer. Keep its
implementation and public-provider conformance small; the absence of a shared
runtime package is deliberate, not permission for undocumented drift.

Specify these properties before implementing:

- Root-relative pathname namespace, case and separator policy; absolute output
  is a caller adapter concern. Reject wire paths escaping the root.
- Matching dialect, dotfiles, files/all entry kinds, and symlink behavior.
  Literal-glob enumeration and ignore-aware search enumeration are distinct
  profiles, not interchangeable backend defaults.
- Requested fields. Names-only must not require one stat per result. Sparse
  metadata is not a complete Effect `File.Info` or atomic content snapshot.
- **Completeness:** a baseline is complete for its declared supported scope or
  fails. A limited search result must say it is partial; do not use it to replace
  an authoritative inventory. No silent budget/permission truncation.
- Freshness: a filesystem walk is a scan over an interval; a synchronized daemon
  query is a checkpointed daemon view; an explicitly unsynchronized daemon query
  can be stale. These are not the same guarantee.

### Baseline aligned with changes

A native/ripgrep baseline can be implemented immediately without claiming an
aligned watch boundary. Existing
[`WatchPlus.reconcile`](file:///home/rektide/src/effect-watch-plus/src/Watch.ts),
lines 43–61, can combine a baseline read with hints and coalesce rereads. It does
not provide OS attachment acknowledgement or recover hints never received.

Watchman can do materially better. Implement alignment with its actual query
clock and subscription protocol, not by reconstructing a cursor after converting
everything to `FileSystem.WatchEvent`. Ordinary watch remains unchanged; the
stronger operation is an opt-in scoped helper/capability.

## Provider placement and implementation

### Watch Plus: native and ripgrep

Add domain modules such as `src/Glob.ts` and `src/Ripgrep.ts`, with optional public
subpaths. Keep `src/Watch.ts` and its watch-only layer backward-behaving. An
explicit glob/enumeration layer captures the input filesystem and backend; it
must not look up its own replaced filesystem during an operation.

**Native:** ordinary glob delegates to captured `fs.glob`. Implement scanned
baselines from those results, enriching only requested fields. The minimal
names/file baseline is useful now. Full dot/follow/type options beyond Effect's
two glob options require an explicit extended implementation, not passing excess
properties that the installed Node provider ignores.

Native entry-type fidelity has a real seam: NodeFileSystem `stat` uses `NFS.stat`
(lines 546–552), which follows symlinks. It cannot identify lexical symlink types
by itself. Exact symlink-aware entries require a native Dirent/lstat adapter or a
deliberately narrower contract. Do not implement a new native watcher to solve
enumeration.

**Ripgrep:** the optional adapter takes a caller-supplied executable and Effect
process spawner. It must not import OpenCode's Environment or binary downloader,
install a binary, read OpenCode environment variables, or assume local placement.
OpenCode supplies its Location spawner at composition.

Implement the file-enumeration baseline now with `rg --files`, explicit policy,
and NUL-delimited output (`-0`). Name matching and ignore policy must be specified:
for a literal/no-ignore profile, disable rg's implicit ignore filters; for an
ignore-aware search profile, retain the declared rg filters. Positive `--glob`
patterns can override other filters, so copying flags is not proof of matching
equivalence. A common residual matcher or verified translation may be needed.

Ripgrep is natively **file-only**. Do not infer empty directories from file
prefixes and call that complete all-entry enumeration. Initially use it for the
file profile, and retain explicitly composed native ordinary glob/all-entry
enumeration. If a caller requires all entries from a forced-rg provider, reject
the unsupported request. A later native directory supplement can be an explicit
composite, not a hidden claim about `rg --files`.

Do not lift the current OpenCode runner unchanged into an authoritative baseline:
[`ripgrep.ts`](file:///home/rektide/src/opencode-working/packages/core/src/ripgrep.ts),
lines 127–151, parses lines, truncates, and accepts exit code 2 alongside success
and no-match. For a baseline, incomplete enumeration errors cannot become a
successful partial inventory. Preserve interruption, bound stderr, kill/release
the scoped child, and report partial/error conditions honestly. Content grep
remains a different operation and need not move into these libraries.

### Watchman: query and watch share one owner

Extract the existing connection/root acquisition ownership from
[`Backend.ts`](../../src/Backend.ts), lines 16–39, into a small internal manager.
Keep its successful cancellation rules: cached `watch-project` acquisition
belongs to the manager, not the first requester, and transmitted commands keep
wire reply ownership after caller cancellation.

Project ordinary WatchBackend and enumeration/query operations from that same
manager. The combined convenience layer constructs it once. Reusing watch and
glob must not create a socket per query or independent project maps. If exposing
separate projection layers, their composition must visibly reuse the same manager
Layer value; calling two independently constructed factories is not a sharing
proof. Do not expose a new public transport supervisor or daemon protocol service.

Use Watchman's in-memory query engine:

- `glob` generator for restricted pathname patterns;
- `suffix` plus a directory expression when it is a verified useful optimization;
- `path`/depth for directory membership;
- `relative_root` for the requested subtree inside the acquired project root;
- only requested result fields.

Push selection down. Do not query every daemon name into JS and run minimatch
there for every small glob. For grammar not directly translatable, use a verified
superset candidate query plus residual filtering, or reject it; never push down a
subset that loses valid matches. The existing ignore grammar includes brace
expansion and its own backslash rules. Watchman has explicit dotfile/escape flags
and case defaults; it is not automatically minimatch/Node/rg equivalent.

The protocol must change before this works:

1. [`Connection.ts`](../../src/Connection.ts), lines 4–17, only decodes object
   file rows requiring `name` and `exists`. Watchman `fields: ["name"]` instead
   returns strings. Rich rows have type and optional/null/error metadata fields.
   Use command-appropriate reply schemas; do not let a query silently discard
   fields through the subscription schema.
2. Commands currently validate one string reply key (lines 150–158). A query can
   validate its clock plus decoded files, but this requires a query reply contract,
   not only `key: "clock"` and trust in the old file schema.
3. The default frame limit is **1 MiB** (lines 131–138); a whole-tree baseline
   can exceed it. Overflow currently terminates the shared socket and sibling
   watchers. Set deliberate supported result-byte limits for the new workload,
   preserve typed failure, and test a realistic baseline exceeding the old cap.
   Watchman's ordinary query returns one result array: wrapping it in a Stream
   does not make its wire decode streaming or memory-bounded. Do not invent
   pagination; partitioned queries have different clocks unless separately aligned.
4. The wire request deadline defaults to 3 seconds. Query synchronization/lock
   defaults are up to 60 seconds. Choose compatible explicit query and command
   deadlines so normal synchronization does not terminally fail sibling watches.
   Keep the one outstanding-command design initially; measure query head-of-line
   latency before inventing a parallel transport pool.

These are concrete baseline implementation prerequisites, not buffer tuning as
the main project. No transparent reconnect or daemon-config rewriting is needed
for the first query/baseline slice.

## Watchman baseline and catch-up correctness

The [query documentation](file:///home/rektide/archive/facebook/watchman/website/docs/cmd/query.md)
supplies returned clocks and cookie synchronization. The
[subscription documentation](file:///home/rektide/archive/facebook/watchman/website/docs/cmd/subscribe.md)
allows subscription from a clockspec. A viable opt-in aligned operation is:

1. Acquire the approved root through the shared manager.
2. Run a synchronized full selection query; return its entries and clock **B**.
   Snapshot queries select currently existing entries. A query without `since`
   normally reports `is_fresh_instance: true`; this is expected for a baseline,
   not a reason to reject it as subscription continuity loss.
3. Install the scoped delivery listener before transmitting `subscribe` from B.
   Buffer complete result batches while waiting for the subscribe acknowledgement.
4. After the acknowledgement, return the baseline plus its change stream. Apply
   the baseline first, then queued batches. Do not require a first nonempty push
   for readiness; a quiet tree may have none.
5. A fresh incremental response, recrawl/history invalidation, terminal socket
   failure, canceled subscription, or delivery overflow fails continuity or
   returns `ResetRequired`. The caller chooses a new baseline/new owner scope.

The query/subscribe gap is covered by `since: B` while history is valid. This is
an aligned *daemon view*, not a transaction over subsequently read file contents.
No native backend should advertise this checkpoint capability without evidence.

For explicit catch-up, query `since` the last **successfully applied complete
batch** checkpoint. Bind it to endpoint identity, canonical root/generation,
relative subtree, selection policy, and capability version. Do not expose a bare
clock string as globally portable. The existing manager remains terminal after
socket loss: rebuilding its Layer remains caller-owned. Reusing a checkpoint in
a new owner must verify its binding and tolerate fresh history; it is not automatic
reconnection or an exactly-once operation journal.

Two correctness traps matter:

- **Generators form a union, not an intersection.** A `since` query also carrying
  `glob`/`path` generators can enumerate unchanged candidates again. Use `since`
  as the incremental generator and pathname expressions for selection. This is
  explicit in [file-query](file:///home/rektide/archive/facebook/watchman/website/docs/file-query.md)
  and `watchman/query/eval.cpp:134–160,484–492`.
- **Do not lose removals through state-dependent filters.** `exists` is valid
  on snapshots, not incremental selection. A files-only type filter can also
  hide an old file replaced by a directory at the same path. Fetch changed
  pathname candidates including tombstones and type transitions; classify rows
  as upsert/remove-from-selection after decoding. For name-only fixed selection,
  this needs no whole-tree JS inventory. Rich Git-ignore/content-dependent
  membership requires additional policy state or a new baseline when policy
  changes. Directory-only hints must not leave descendants indefinitely stale.

Do not treat `new` as a durable operation log. Catch-up describes changed current
states and retained tombstones; transient operations may collapse. Consumers
must apply batches idempotently and publish/store a checkpoint only after applying
the complete batch, not when receiving it.

## Policy and placement are adoption gates, not generic fallbacks

Watchman does not recursively follow symlinks, nor does it watch through each
symlink's target for changes. Its `ignore_dirs`/`ignore_vcs` configuration limits
what is observed. A full baseline is only complete within supported daemon
coverage; do not relabel it complete for literal filesystem requests requiring
excluded paths. Inspect/expose relevant coverage or reject such requests; do not
rewrite the user's daemon configuration to make the claim true.

OpenCode's existing discovery has different needs:

- [util glob](file:///home/rektide/src/opencode-working/packages/util/src/glob.ts)
  maps `cwd`, `absolute`, `include`, `dot`, and recursive symlink following onto
  npm glob.
- [FSUtil scan/globUp](file:///home/rektide/src/opencode-working/packages/util/src/fs-util.ts),
  lines 158–163,194–208, bypass the injected Effect glob today.
- Config agents, commands, ordinary skills, and compatibility skills request
  `dot: true, symlink: true`. Do not silently route those to an incapable
  Watchman provider. Keep native discovery or implement separately declared
  target-root handling; the latter is not part of a simple query-only slice.
- Ancestor discovery can traverse through home/root. Merely converting globUp
  into daemon queries can acquire whole-home/root watches via `watch-project`.
  Keep that path native; use daemon queries only in explicitly approved local
  root scopes. Checking the returned root *after* `watch-project` is not proof
  that a broad watch was never acquired.
- The [Glob tool](file:///home/rektide/src/opencode-working/packages/core/src/tool/plugin/glob.ts),
  lines 93–119, calls Ripgrep directly. It will not benefit from replacing
  `FileSystem.glob` until explicitly adopted. Preserve its permissions, file-only
  output, hidden handling, limit/truncation, and ignore behavior.
- [Ripgrep](file:///home/rektide/src/opencode-working/packages/core/src/ripgrep.ts)
  uses the Location Environment spawner. Hosted Locations must retain that
  placement seam. A control-server Watchman query against the same pathname
  is not remote-workspace enumeration.

Selecting Watchman for watching does not automatically authorize changing every
enumerator's policy. Conversely, disabling event observation need not prohibit
read-only enumeration. Host composition should declare these choices; never hide
a failed forced-Watchman query by switching to native.

## What can be dropped, and what cannot

Watchman can replace duplicate pathname **walks and retained discovery lists**
when the requesting operation can query the daemon's shared in-memory view.
Warm queries still transfer their results; cold root acquisition still needs a
daemon crawl. Repeated queries are not free and large results create transient
wire/JSON/array memory. Measure this rather than claiming zero inventory cost.

OpenCode's fallback
[`FileSystemSearch.ripgrepLayer`](file:///home/rektide/src/opencode-working/packages/core/src/filesystem/search.ts),
lines 57–119, prepares fuzzysort maps, including derived directories. It can use
a provider baseline and deltas later, or query candidates on demand if ranking
semantics are deliberately changed. Watchman glob is not an FFF/fuzzysort ranker.
Keeping ranking means keeping some index or doing equivalent work on demand.

FFF is more demanding. Its
[`ScanJob`](file:///home/rektide/src/fff/crates/fff-core/src/scan.rs), lines 167–195,
still calls `FileSync::walk_filesystem` even with native watching disabled.
[`walk_filesystem`](file:///home/rektide/src/fff/crates/fff-core/src/file_picker.rs),
lines 2016–2134, consumes files, directories, and metadata, then constructs compact
path storage and native search state, and applies frecency. The
[`walker module`](file:///home/rektide/src/fff/crates/fff-core/src/walk/mod.rs)
selects zlob/ripgrep at compile time and includes empty visited directories.

There is **no external-baseline initialization API** in the consumed fork.
Its event-ingestion API is not an efficient substitute: it waits for the native
baseline and feeds the existing incremental processing pipeline. To eliminate
FFF's initial walk, a separate FFF change must accept externally enumerated
records at the walk/index-construction boundary, preserving directory semantics,
metadata needs, ignore rules, native path arenas, frecency/git processing, and
baseline-to-delta order. Keep that work with FFF; do not put Rust ranking internals
in Watch Plus or promise removal of the fuzzy index's memory.

## First implementation slice and next checkpoint

### Library slice to commission first

1. Record the small enumeration contract and distinct policy profiles; add the
   checked enumeration view without changing watch options/v2 semantics.
2. Implement native scanned baseline and the optional scoped-spawner ripgrep
   file baseline in Watch Plus. Preserve ordinary native glob where rg's
   file-only capability is insufficient.
3. Refactor Watchman's existing owner into one internal manager; implement
   command-specific query decoding and a pushed-down glob/enumeration baseline,
   returning an opaque checkpoint. Establish deliberate baseline frame/deadline
   budgets; do not silently limit a complete snapshot.
4. Prove the same file-enumeration consumer through all three providers, plus
   policy/capability rejection. No OpenCode build, publication, or live wiring is
   needed to establish this library boundary.

This first slice already includes **baseline implementation**, not only another
design scaffold. It improves query-only discovery immediately without claiming
baseline/watch alignment. The next coherent library slice is Watchman aligned
snapshot-and-subscribe and explicit catch-up, using the same manager/checkpoint.

### Architectural checkpoint

Review the public consumer example and concrete conformance evidence before
application adoption:

- Does a native or Watchman baseline have the same declared file membership?
  Test dotfiles, braces/classes/escaping, literal excludes versus subtree pruning,
  symlink files/directories, ignored roots, nested relative roots, and case policy.
- Are errors/partial results distinguishable from an empty complete baseline?
  Test permission failure, rg code 2, cancellation, special filenames, query
  responses exceeding the previous 1 MiB cap, and quiet-tree completion.
- Is there one connection/project owner for watch and enumeration? Does query
  cancellation preserve sibling watching? Does a large/slow query have an
  acceptable explicit resource/deadline bound?
- For the aligned slice, test mutations between query and subscribe, pushes
  before acknowledgement, deletion and file/directory replacement, fresh history,
  policy changes, history age-out, and an applied-versus-received checkpoint.
- Does forced Watchman report unsupported semantics rather than quietly changing
  provider? Are hosted/ancestor discovery paths kept on their rightful placement?

Then choose one policy-compatible OpenCode consumer: approved-root file glob or
the fallback search baseline. Changing FSUtil alone leaves the direct Ripgrep
tool path and FFF native scan unchanged. FFF external-baseline support is a
separate architectural checkpoint, not a prerequisite for useful daemon queries.

Measure cold/warm enumeration, filesystem walk counts, transferred bytes, server
and daemon CPU/RSS, transient result memory, and event-to-result freshness.
The intended payoff is shared enumeration and less duplicate traversal/state,
not an unmeasured universal memory-savings claim.

## Cross-references

- [Existing additive contract, “Guarantees ordinary watch cannot express”](file:///home/rektide/src/effect-watch-plus/design/watch/contract.md#guarantees-ordinary-watch-cannot-express):
  precedent for optional coherent operations without replacing ordinary watch.
- [Watchman's current handoff, architectural limits](../../HANDOFF.md#architectural-review-and-limits):
  the current boundary this proposal extends; its no-inventory claim remains true
  until implementation lands.
- [Integration ownership and fallback-search follow-up](file:///home/rektide/src/opencode-watchman/design/filesystem-watch/README.md#libraryapplication-ownership):
  application responsibilities stay in OpenCode, provider mechanics in libraries.
- [FFF implementation receipt](file:///home/rektide/src/opencode-watchman/design/filesystem-watch/fff-implementation.sol-medium.md#native-and-public-binding-boundary):
  evidence that shared changes were implemented, not external baseline ingestion.
- [Watchman file queries](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/website/docs/file-query.md)
  and [query](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/website/docs/cmd/query.md):
  revision-bound protocol evidence for generator pushdown, relative roots, clocks,
  and synchronization. This review did not run a daemon or conformance experiment.
