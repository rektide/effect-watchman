# Build handoff: effect-watchman + Watch Plus

Revised 2026-10-10 by GPT-6 Astra following explicit user correction and two
Sol-medium source/design investigations. This replaces the handoff preserved in
commit `1d9f1c7b`. The previous recommendation to port/preserve Parcel is withdrawn.

## Start building toward this destination

**Build an Effect v4 Watchman backend with stronger optional observation tools.**
Effect's own native watcher is the default alternative. `effect-watch-plus`
supplies general policy and native polyfills; it can use Watchman's stronger
operations through an optional adapter. Neither package imports OpenCode Core.

The user wants implementation momentum and accepts a bounded first cut with
explicit limitations. Read the shared contract, inspect the pinned Effect seam,
then implement real code and public-surface tests. Do not restart the broad
design discussion or attempt a universal filesystem framework.

The authoritative cross-library contract is
[Watch Plus composition](file:///home/rektide/src/effect-watch-plus/design/watch/contract.md).
Its [handoff](file:///home/rektide/src/effect-watch-plus/HANDOFF.md) covers native
observation, topology, filters and reconciliation. The OpenCode port is separately
planned [here](file:///home/rektide/src/opencode-watchman/design/filesystem-watch/README.md).

## 1. The two surfaces to build

### Standard Effect backend

Provide `FileSystem.WatchBackend` for ordinary `FileSystem.watch` consumers:
file, direct-child and recursive watching, scoped resources, ordinary Effect
watch events and typed platform failures. Prove it by constructing the real
Effect filesystem Layer with this backend and consuming `fs.watch` in an example.

### Enhanced Watchman observations

Offer an independently meaningful, scoped Watchman API for acquired interests,
acknowledged attachment, canonical roots, clock-covered query/subscription
handoff and compatible catch-up. These are the optimization tools Watch Plus
can use. They must not be reconstructed after discarding metadata through
standard `fs.watch` events.

Both surfaces use **one Layer-owned Watchman manager**. Providing both must not
create duplicate socket/root pools. Standard streams fail when their contract
cannot represent lost continuity; enhanced streams may catch up or announce
resync. A consumer's scope owns its lease, buffer and partial acquisition.

Dependency direction:

```text
effect-watchman → Effect / runtime transport
effect-watch-plus/core → Effect
effect-watch-plus/watchman → Plus core + effect-watchman
```

Watchman imports no Plus types. Plus owns the generic provider interface and
adapter; the adapter is an optional export with an optional Watchman peer, absent
from native-only imports. Keep Watchman's enhanced API useful without Plus.

## 2. Repository and source basis

This repo started at `2e194831` with empty `README.md`/`effect-watchman.ts` and an
ESM package skeleton. The placeholder test command fails; build/exports/dependency
configuration is not an existing public contract. At this revision only handoff
documentation has been implemented. Check status before editing.

Initially target/test **Effect 4.0.1**, the consumer's pinned version. Use Effect
as a compatible peer; avoid bundling a second runtime identity. Resolve actual
installed sources if dependency paths change:

```text
/home/rektide/src/opencode-watchman/node_modules/.bun/effect@4.0.1/node_modules/effect/src/FileSystem.ts
/home/rektide/src/opencode-watchman/node_modules/.bun/@effect+platform-node-shared@4.0.1+ff18a43d1df18ff8/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts
```

The separate Effect reference checkout at
`~/.local/share/opencode/repos/github.com/Effect-TS/effect-smol` differs at this
seam. Installed declarations/source are the initial compatibility authority.

Verified 4.0.1 semantics:

- `FileSystem.watch(path, { recursive? })` returns a stream of Create/Update/Remove.
- `WatchBackend.register(path, stat, options?)` returns an optional stream.
- The Node filesystem captures the optional backend at **Layer construction**.
- Node stats the target before calling the backend; missing targets fail before
  `register`. Plus handles missing interests through existing ancestors.
- `None` selects native fallback. Forced Watchman should return `Some(stream)`
  and fail on configuration/attachment failure, never silently fall back.
- Default Node callbacks report relative names. Preserve the platform-facing
  path convention deliberately; Plus normalizes its own notices to absolute
  lexical paths against the actual watch anchor.
- The standard event union has no readiness/resync/cursor channel.

## 3. Resource and protocol requirements

Use Effect services/Layers, Schema decoding at the wire boundary, scoped child
fibers, owned Deferred replies, bounded queues and Effect clocks/schedules.
Node callbacks are an I/O edge, not a reason to spawn detached fibers throughout
the controller. Separate connect, command and cleanup deadlines.

Start with one manager/controller connection per explicit endpoint and canonical
root, with named subscriptions per interest. Share root/transport work; merging
all different filters into one giant subscription is unnecessary. Exact duplicate
subscription sharing is an optional later optimization.

Acquire sockets into a scope immediately, before capability checks/attachment.
Scope closure must interrupt and join owned work with bounded teardown and local
socket destruction even if the daemon is silent. Releasing one lease leaves
sibling observations alive. Do not `watch-del` roots other clients may use.

Use explicit socket configuration; no daemon autospawn or autodiscovery is needed
for the first cut. Negotiate the commands/fields actually required. Array-form
JSON command envelopes worked with the older stock daemon used by the previous
effort. Decode stock unilateral cancellation before ordinary pushes. Serialize
commands and settle every pending request once on terminal failure.

Framing must handle split UTF-8 and multiple frames in one chunk; apply size
limits per frame. Keep an explicit policy for valid large listings, and bound
per-consumer queues. Overflow must result in known loss/resync/failure, not
silently discarded deletion notices or unbounded memory.

Permanent configuration/capability/poison failures fail explicitly. Retry
transient loss with bounded backoff/jitter and a meaningful reset condition.
Do not classify a disturbance as a successful attempt. One layer owns retries;
Plus must not add another transport supervisor around this one.

## 4. Standard backend semantics

Establish a clock boundary, subscribe from it, and emit ordinary changes rather
than initial inventory enumeration. A file interest must survive atomic editor
replacement, normally by observing its parent/root and filtering the basename.
Honor nonrecursive versus recursive directory requests. Map canonical names to
the consumer's logical namespace and reject escaping paths.

`exists` alone cannot distinguish creation from update. Request supported `new`
metadata or use defined membership/baseline logic where necessary. Watchman
`new` is relative to a since boundary, not proof of an exactly-once creation.
Rename normally appears as removal/upsert. Directories and subtree deletion need
consistent behavior. Suppress Watchman cookie files.

For the first standard adapter, failure on transport interruption is acceptable.
Always fail with a documented `PlatformError` when continuity cannot be proven:
fresh history, local buffer loss, or an unrecoverable gap. Never emit a fabricated
`Update(root)` and pretend it represents all lost deletions. The enhanced API
below can express recovery that the standard event union cannot.

## 5. Enhanced observation and optimization tools

### Coherent acquisition and inventory

Expose complete observation operations, rather than unrelated clock/snapshot/watch
calls consumers must race together. A useful inventory path is:

1. Resolve/watch the project root; retain its returned root and `relative_path`.
2. Query a synchronized, compatible inventory and receive clock C.
3. Subscribe from C with the same interest/relative-root/filter semantics.
4. Buffer notifications immediately; publish baseline before corresponding deltas.
5. If history is fresh/incompatible, invalidate and rebuild the baseline.

Ordinary acquired observation should also work without requiring an inventory
enumeration when the caller only needs hints. Subscribe acknowledgement establishes
installation; do not wait for a first nonempty push, which may never arrive.
Acknowledgement, synchronization barrier and baseline are separate facts.

Daemon inventories are not atomic content snapshots. A later read may return
newer content or a missing file. Names, stat fingerprints and content hashes are
different inventory contracts. The Plus adapter may use daemon candidate paths
without claiming a stronger content/fingerprint guarantee.

### Catch-up and checkpoints

Catch-up produces changed current states and retained deletion tombstones. It
does not replay every operation. Fresh-instance results omit historical deletions,
and tombstone GC can make a syntactically valid clock unusable.

Keep checkpoints opaque and bound to controller/endpoint, canonical root
generation, relative scope, recursion, effective filter, mapping and inventory
model. Reject incompatible reuse. Do not claim portable/persistent cursors in
the first cut. A shared root's latest received clock is not each consumer's
applied state; expose that distinction.

A recoverable gap with nonfresh catch-up may continue the current observation.
Fresh history, root identity change or buffer loss requires resync/replacement
baseline before declaring state current. Use actual history semantics, not
sticky/suppressed recrawl warning text, to determine continuity.

### Filter pushdown

Start with pathname-stable selectors: exact paths, subtree prefixes/depth and
literal exclusions. Push a conservative superset for unproven glob/predicate
semantics; Plus applies residual filtering. Test dotfiles/case/escaping.

Never apply `exists` to incremental expressions: it removes deletion tombstones.
State-dependent filters such as file size can hide membership exits and require
tracking beyond a naive predicate. Watchman's query generators can union
candidates; combining since with broad path/glob generators is not necessarily
intersection filtering. Keep scope/filter expressions compatible with deltas.

This optimization reduces result transport and consumer work, not necessarily
daemon crawling/kernel watches. Root `ignore_dirs`/`ignore_vcs` may exclude data
before a subscription can see it. Inspect/report coverage and reject or qualify
requests outside it. Do not rewrite `.watchmanconfig` to enforce application
policy. Recursive symlink following is not promised.

## 6. Known prior failures: keeper scenarios

The earlier OpenCode carrier is frozen at:

```text
repository: /home/rektide/src/opencode-watchman
bookmark: watchman-20261010-pre-rework
commit: dd4b8ba8c2dd6c859ecd11b42493e4fbddf4fc02
```

The current OpenCode working tree starts fresh at `v2@origin`; use
`jj file show -r <frozen-commit> <path>` there for the old
`packages/core/src/filesystem/watchman/{session,protocol,mapping,directory}.ts`
and matching tests. Read them as defect-bearing reference, not code to transplant.

| Failure | Concrete regression |
| --- | --- |
| Attach leak | Three rejected `watch` attempts left three sockets open, including after stop; cleanup had depended on assignment after successful attach. |
| Unsettled mismatched response | A watch reply to a clock request cleared its deadline/in-flight reference before validation, leaving the request pending forever. |
| Consumer missed loss | Compatibility skills stayed stale after a disconnected edit and invalidation, until a later exact event. Protect the semantic loss signal at your boundary; application tests belong to the port. |
| Cancellation misdecoded | `{unilateral:true,canceled:true,subscription:...}` was treated as an empty push. |
| Reconnect thrash | Discarded disturbance value returned success; 14 installations occurred in 160 ms against a flapping peer. |
| Shutdown hang | Half-closing then awaiting an unresponsive peer's close had no deadline. |

Local scratch probes remain at `/home/rektide/tmp-opencode/watchman-review-probes.ts`
and `watchman-review-consumer.ts`. They use absolute imports and are not maintained
tests. Convert their scenarios into keeper tests here. Passing the old mocks and
typechecks did not prove these contracts.

## 7. Implementation sequence and evidence

1. **Package/real Effect seam:** establish exports/scripts/dependencies; prove the
   provided backend is selected during real filesystem Layer construction and
   scopes release it. No Parcel preparation stage.
2. **Transport/manager:** typed serialized protocol and scoped acquisition;
   rejection/mismatch/cancellation/timeout/teardown keepers.
3. **Backend:** file/direct/recursive semantics and shared roots; atomic saves,
   missing/replaced-root boundaries, sibling release and no post-release output.
4. **Enhanced observations:** acknowledged start without waiting for files;
   query/subscribe-since handoff including an edit/deletion in the gap; fresh
   history, compatible catch-up and bounded buffers.
5. **Plus adapter conformance:** coordinate the optional adapter in Plus; run one
   consumer against native and Watchman without application-specific branches.
   Keep the root manager shared when both standard/enhanced surfaces are supplied.
6. **Real daemon:** isolated scratch daemon, named version, create/edit/delete,
   nested changes, atomic saves, read-only quietness, loss/recovery and disposal.
   Test through the public Effect and Plus surfaces, not just private methods.

Use `/home/rektide/tmp-opencode` for scratch files. Do not restart the operator's
OpenCode service/app or shared daemon. At assessment time no watchman/watchwoman
binary was on PATH; check again rather than assuming that persists.

Earlier lineage records a read→update feedback bug in one deployed Watchwoman
revision. Repeat the read-only test for any daemon you claim to support; do not
generalize historical evidence into a claim about its current version. Stock
Watchman source/docs are initial wire references, not a substitute for live tests.

First-cut limits: local Unix-socket daemon; no auto-discovery/spawn; no portable
cursors, operation journal, exactly-once events, rename identity, atomic content
snapshot, arbitrary Git-ignore equivalence, recursive symlink traversal,
merged-filter subscription optimizer or untested daemon/platform parity.

Commit coherent stages with `jj`. Report imports/examples, revisions, Effect and
daemon versions, tests/checks, resource-sharing/cleanup evidence, Plus adapter
status, and exact remaining limitations. Both repos are implementation targets;
the initial useful result need not include every optional optimization.

## 8. Downstream use and sources

OpenCode's new first cut migrates Effect-based Core consumers and adds local
workspace/client freshness. FFF's Rust-owned watcher and TUI-local watchers are
explicitly outside that first cut. Hosted files need their own placement adapter.
This library must not pretend to replace those just because Core selects it.

The host selector is now `OPENCODE_WATCHER_BACKEND=native|watchman`, default native.
The old branch's `parcel` selector needs no compatibility alias. Host composition
handles env/typed options; forced native bypasses Watchman, forced Watchman never
silently falls back, and global disable takes precedence over validation.

Useful references:

- <https://facebook.github.io/watchman/docs/cmd/subscribe>
- <https://facebook.github.io/watchman/docs/cmd/query>
- <https://facebook.github.io/watchman/docs/file-query>
- <https://facebook.github.io/watchman/docs/cmd/watch-project>
- <https://facebook.github.io/watchman/docs/clockspec>
- <https://facebook.github.io/watchman/docs/config>
- <https://facebook.github.io/watchman/docs/expr/match>
- <https://github.com/facebook/watchman/blob/main/watchman/cmds/subscribe.cpp>
- <https://github.com/facebook/watchman/blob/main/watchman/Client.cpp>

Moving upstream source links establish the researched design; pin the daemon
revision when making an implementation/release guarantee.
