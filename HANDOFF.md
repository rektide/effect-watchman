# Build handoff: effect-watchman

Prepared 2026-10-10 by GPT-6 Astra, following the user's review and architectural
direction in `~/src/opencode-watchman`.

## Start here

**Build a reusable Effect v4 `FileSystem.WatchBackend` implementation backed by
Watchman. Make the Effect backend the primary integration surface.** OpenCode
will be ported to Effect's filesystem watching and consume this package.

The user wants implementation momentum, useful workload coverage, and a cleaner
abstraction. They accept additional carry burden and future revision. Proceed
to working code and tests after a short contract check; do not spend the next
session reproducing the entire design investigation or returning another broad
plan. Commit coherent stages with `jj` as they become usable.

Read sections 1–5, inspect the pinned Effect sources, then build the first
end-to-end example: **provide this backend to the real Effect filesystem layer,
consume `fs.watch`, edit a temporary directory, observe changes, close the scope,
and prove resources are released.** A private client test alone is insufficient.

## 1. Current repository and intended split

At handoff, this repository is `~/src/effect-watchman`, initialized at `2e194831`.
`README.md` and `effect-watchman.ts` are empty. `package.json` is an ESM skeleton
named `effect-watchman`, with placeholder entrypoints and a deliberately failing
placeholder test script. There are no installed dependencies or working build
scripts established by this handoff. Inspect status again before editing.

The intended architecture is:

```text
OpenCode owners: config, skills, plugins, workspace views, search
                         ↓
Thin application policy: interests, reconciliation, Location routing
                         ↓
Effect FileSystem.watch / WatchBackend
                         ↓
effect-watchman (this repository)
                         ↓
Watchman daemon on the host that owns the files
```

There are three independently useful bodies of work:

1. **This package:** correct, reusable Effect Watchman backend and its tests.
2. **OpenCode port:** route existing watching through Effect, initially preserving
   Parcel/native behavior as a selectable backend, then select this implementation.
3. **OpenCode adoption:** workspace/UI refresh, search/indexing, plugin APIs and
   placement-aware observation. Changing the backend alone does not implement
   those missing consumers.

This package must not depend on OpenCode Core/Server, session IDs, its event bus,
configuration discovery or UI. Root sharing, socket lifetimes and Watchman
protocol behavior belong here; application rescans and cache semantics remain
with their owners. Offer explicit Layer configuration instead of reading
OpenCode environment variables inside the library.

**Latest direction supersedes the earlier layering proposal:** the prior impact
plan proposed a richer custom observation service with an Effect adapter added
alongside it. The user then proposed making Effect's backend the actual common
boundary, and the assessment endorsed that. Keep the backend central; introduce
only the supplementary contract necessary to express readiness/lost continuity.

## 2. Sources you can use immediately

### Effect: use the installed version as the initial authority

The assessed OpenCode tree pins **Effect 4.0.1**. Initial compatibility should
target that exact version, with a deliberate peer-dependency range once tested.
Do not accidentally install a different major or bundle a second independent
Effect runtime into consumers.

Known local source files:

```text
/home/rektide/src/opencode-watchman/node_modules/.bun/effect@4.0.1/node_modules/effect/src/FileSystem.ts
/home/rektide/src/opencode-watchman/node_modules/.bun/@effect+platform-node-shared@4.0.1+ff18a43d1df18ff8/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts
```

Relevant symbols: `FileSystem.watch`, `WatchOptions`, `WatchEvent`, `WatchBackend`,
and NodeFileSystem's `watch` and `makeFileSystem`. Installation-specific paths can
change; resolve the actual package when necessary. A separate source checkout
exists at `~/.local/share/opencode/repos/github.com/Effect-TS/effect-smol`, but it
was observed to differ from the pinned installation at this seam. Do not silently
substitute its API for 4.0.1.

The relevant 4.0.1 contract is:

```ts
// Contract sketch from the pinned source; imports/names abbreviated.
FileSystem.watch(path, { recursive?: boolean }): Stream<WatchEvent, PlatformError>

WatchBackend.register(path, stat, options?):
  Option<Stream<WatchEvent, PlatformError>>

WatchEvent = Create | Update | Remove // each carries a path
```

Load Effect's local guidance and verify APIs from source. Use Effect v4 APIs,
Schema at untrusted boundaries, services/Layers and structured concurrency.

### Existing implementation: useful reference, not trusted transplant

Repository: `/home/rektide/src/opencode-watchman`.

Frozen feature checkpoint:

```text
watchman-20261010-pre-rework
dd4b8ba8c2dd6c859ecd11b42493e4fbddf4fc02
```

An FX created that bookmark without moving `watchman` or `watchman-20261010`.
It preserves the assessed implementation, not an accepted release.

Read these files at that revision if the working tree has moved:

```text
packages/core/src/filesystem/watchman/protocol.ts
packages/core/src/filesystem/watchman/session.ts
packages/core/src/filesystem/watchman/directory.ts
packages/core/src/filesystem/watchman/mapping.ts
packages/core/test/filesystem/watchman/{session,directory,mapping,live}.test.ts
packages/core/src/filesystem/watcher.ts
```

`jj file show -r <revision> <path>` recovers the frozen contents from that repo.
The package is not using `fb-watchman-esm`, despite stale commit wording: the
actual implementation is a custom Node Unix-socket JSON-line client.

Broader workload plan: [impact-plan-20261010.gpt6a.md](file:///home/rektide/src/opencode-watchman/.design/watchman/impact-plan-20261010.gpt6a.md),
committed there as `67b776e6`. Its workload map remains useful; apply the layering
correction above. [Feature lineage](file:///home/rektide/ado/watchman.md) records
the earlier daemon-parity work.

Watchman references:

- <https://facebook.github.io/watchman/docs/cmd/subscribe>
- <https://facebook.github.io/watchman/docs/cmd/watch-project>
- <https://facebook.github.io/watchman/docs/clockspec>
- <https://github.com/facebook/watchman/blob/main/watchman/Client.cpp>

## 3. Contract decisions to settle before expanding implementation

### A. Correct Layer injection

Effect's Node filesystem captures the optional `WatchBackend` **during layer
construction**. Supply the backend while constructing that filesystem Layer.
Providing it only around a later `fs.watch` call does not replace an already
constructed service. Test this using the real platform implementation.

The Node implementation calls `stat(path)` before `register`. A missing target
never reaches the backend. Missing-file interests must watch an existing parent
or use a deliberately extended contract; do not promise missing-path support
that the actual entrypoint prevents.

`Option.none` means that Effect falls back to its Node watcher. In explicitly
selected Watchman mode, a missing socket, protocol failure or missing history
must not accidentally return `none` and silently enable another watcher.

### B. Readiness and lost continuity

The current public event union has no readiness or invalidation event. Ordinary
path deltas cannot describe a recrawl that omitted deleted files or an overflow
that lost arbitrary events.

The user is open to improving the Effect abstraction. The most useful generic
additions to consider are:

- an invalidation/rescan signal for lost continuity, useful to native backends
  as well as Watchman;
- a readiness/acquisition contract supporting subscribe-before-baseline-read.

Do not pretend those extensions already exist. Record the exact delta if an
Effect companion change is needed and coordinate it as a separate patch. Avoid
making generic callers understand Watchman clock strings.

**A shippable initial behavior against unchanged 4.0.1:** fail the standard
stream with a documented `PlatformError` on unrecoverable continuity loss; the
owner rescans and resubscribes. Provide any necessary richer readiness/loss
interface as a small explicit companion, sharing the same implementation.
Do not silently reconnect and resume a stream after dropping history, nor emit
a fake `Update(root)` and claim it communicates every lost deletion.

Resolve the attach/baseline race explicitly. Use Watchman clocks and `since` to
cover writes around subscription and snapshot acquisition. Buffer or replay
changes across baseline load; expose when observation is genuinely installed.
Resume incrementally when continuity is valid. On a fresh instance, invalidate
or fail as specified. The guarantee is convergence, not an atomic filesystem
snapshot or exactly-once delivery.

### C. Path and event semantics

- Support file, direct-child and recursive watching; `recursive` defaults to
  false in Effect. File watching must survive atomic editor replacement, usually
  by watching the parent and filtering the basename.
- Verify path spelling against the pinned platform implementation. Its default
  Node watch callback reports names relative to the watched context; the old
  OpenCode adapter emitted absolute paths. Establish and test the mapping rather
  than blindly retaining the old convention.
- Canonical daemon paths and consumer logical/symlink paths are different
  namespaces. Map intentionally; prevent escaping the requested root.
- `exists: true` does not alone distinguish creation from modification. Use
  supported daemon fields or membership state with defined baseline semantics.
  Directory events, subtree removal and rename must be handled consistently.
- Preserve watchman-cookie suppression and test Unicode/split wire frames.

### D. Sharing and filtering

Own resource maps in a Layer, not module-global mutable state. Share physical
root controllers across consumers, keyed by endpoint and canonical root (and
filesystem-host identity when relevant). Start with one connection per root and
named subscriptions on it. Reference-count demand and release on scope closure;
one consumer ending must not stop another.

Project root resolution and `relative_root` can share nested interests without
new physical daemon watches. Honor daemon capabilities. Do not edit a user's
`.watchmanconfig`, restart their shared daemon or delete a root another client
may use. Closing this client's subscriptions/connections is the normal cleanup.

Effect's current watch options only cover recursion. OpenCode currently pushes
ignore rules into Parcel. Event filtering and avoiding unnecessary daemon work
are different properties. Keep this explicit; propose a small generic filtering
extension if needed rather than hiding a costly semantic regression. Watchman
does not automatically implement ripgrep's Git-ignore semantics.

## 4. Six known defects: regression seeds

These were found in the frozen OpenCode carrier. Five transport/controller
probes plus the consumer probe demonstrated the failures; real stock Watchman
source confirmed the cancellation envelope. Do not carry them into this package.

| Defect | Trigger and observed consequence | Required invariant |
| --- | --- | --- |
| Leaked attachment sessions | Cleanup was conditional on `live`, assigned only after attach. Three `watch` rejections left three sockets open even after unsubscribe/scope close. | Every acquired connection is owned immediately, including capability rejection and interruption during attach. |
| Unsettled mismatched reply | Reply handling cleared the timeout and `inFlight` before validating the reply type. A `watch` reply to a `clock` request left that request pending forever. | Every outstanding request settles once on terminal failure, including the request whose reply was malformed/mismatched. |
| Lost recovery at consumers | Compatibility skills had no readiness rescan. A file edited during a gap stayed stale after invalidation and updated only after a later exact event. | Loss cannot be silently discarded at the API boundary; document and test what owners must do. |
| Cancellation decoded as a push | Stock sends `{ unilateral: true, canceled: true, subscription: ... }`. Decoder checked unilateral first and produced an empty normal push. | Recognize cancellation before ordinary unilateral updates; test actual wire envelopes. |
| Reconnect without backoff | Controller awaited a disturbance Deferred but discarded its failure value, returning success. A flapping peer caused 14 installs in 160 ms. | Runtime disturbance enters the failure/retry policy; success/reset has an explicit meaning. |
| Unbounded cleanup | Final unsubscribe wrote and half-closed, then waited forever for remote close. A half-open peer kept `close()` pending. | Cleanup is bounded and ultimately destroys the local socket regardless of daemon cooperation. |

Scratch reproductions are currently available at:

```text
/home/rektide/tmp-opencode/watchman-review-probes.ts
/home/rektide/tmp-opencode/watchman-review-consumer.ts
```

They are local diagnostics with absolute imports, not a maintained test suite.
Use their scenarios to write keeper tests here. Earlier carrier checks passed
92 tests with one live-daemon skip and passed the full repository check with
lint warnings; those green checks did not cover these failures.

Additional lifecycle cases worth exercising as part of these same contracts:
cancel during connect; multiple queued commands on failure; sibling consumer
release; malformed/oversized frames; partial UTF-8 frames; root replacement;
slow consumers; recrawl deletion; no post-release publication.

## 5. Build sequence: small working stages

### Stage 1 — Package and real Effect seam

Establish TypeScript build/typecheck/test scripts and honest package exports.
Use the repository's own test command once created, not OpenCode's monorepo
scripts. Pin test dependencies to the chosen Effect baseline. Keep runtime
dependencies small and transport imports Node/Bun appropriate.

Create a real platform-layer integration test that proves a provided backend is
invoked through `FileSystem.watch` and that stream scope exit releases it.
Then use the production Watchman backend in that same path. The first example
and README should show this actual Layer composition.

### Stage 2 — Scoped transport and typed protocol

Use `Context.Service`/Layer, `Effect.acquireRelease`, Scope-owned child fibers,
Schema decoding, serialized command requests and Deferred replies. Node socket
callbacks may exist at the edge; they should feed one owned state machine, not
spawn detached fibers throughout the implementation.

Separate connection, request and teardown deadlines. Preserve interruption.
Use Effect clocks/schedules for retries. Decode commands/replies at one boundary,
including errors, unilateral pushes, cancellation and capability checks. Array
command envelopes worked with the stock daemon tested by the earlier effort.

Enforce framing limits per frame rather than accidentally rejecting a chunk
containing several valid frames. Large valid initial listings need an explicit
size/pressure policy. Bound delivery queues; on loss of buffered deltas surface
invalidation/failure, never silently drop the only deletion notice.

### Stage 3 — Backend semantics and shared roots

Implement attach, event mapping, `since`/generation handling, direct-child and
recursive filtering, root leases, cancellation and cleanup. Use the six defects
above as regression seeds, plus attach/baseline and consumer-overflow tests.
Keep the standard Effect surface central throughout.

### Stage 4 — Real daemon and consumer demonstration

Run an isolated scratch daemon and test through the real Effect filesystem
Layer: create, modify, delete, nested changes, atomic saves, multiple consumers,
disconnect/recovery behavior and disposal. Require one genuine daemon run for
a release claim; scripted peers remain valuable for deterministic failures.

During the assessment `watchman` and `watchwoman` were not on PATH. Check the
current environment rather than assuming that is still true. Prefer scratch
files under `/home/rektide/tmp-opencode`; do not restart the operator's OpenCode
application, server, or shared daemon for verification.

If supporting Watchwoman, name its tested revision. Earlier work recorded an
ordinary-read → subscription-update feedback loop in a deployed version, while
stock Watchman stayed quiet. Repeat the read-only case; do not mask that daemon
bug by continually rescanning or claim current parity without testing it.

### Stage 5 — Consumption handoff to OpenCode

Deliver a usable import/Layer example, tested Effect/platform versions, status
of readiness/invalidation extensions, failure semantics, resource-sharing
evidence, and any companion patch coordinates. Make the package consumable from
a separate example/fixture, not only via private imports inside its own tests.

Suggested coherent commits: package/seam; protocol/transport; backend and sharing;
continuity/lifecycle keepers; real-daemon evidence and consumer documentation.
Tests can land with their owning implementation. Keep review corrections as
separate commits before any later condensation.

## 6. The OpenCode consumer contract to equip

These files in `~/src/opencode-watchman` establish the actual port points:

- `packages/core/src/filesystem/watcher.ts`: currently bypasses Effect and calls
  Node/Parcel/custom Watchman directly.
- `packages/util/src/fs-util.ts`: its service interface already extends Effect
  FileSystem, including `watch`; this is an available route for consumption.
- `packages/util/src/effect/app-node-platform.ts`: constructs NodeFileSystem.layer;
  supply the selected WatchBackend at this construction boundary.
- `packages/cli/src/server-process.ts` and `packages/server/src/routes.ts`:
  current environment selection and typed configuration plumbing.

The mandatory escape hatch is `OPENCODE_WATCHER_BACKEND=parcel`; unset also
selects Parcel. This belongs to the host's composition. Preserve it across the
port so it selects a genuinely different backend for every migrated consumer.
Fix global watcher-disable precedence in OpenCode: it currently validates bad
Watchman options before honoring `enabled: false`. Client environment changes
do not reconfigure an already-running server.

Bigger adoption remains essential but is not a prerequisite for building this
library. The current OpenCode feed mainly watches branch metadata; GUI files
and working-tree review already listen for general filesystem changes. Agent
writes have an explicit watcher-notification TODO. File-search fallback does
periodic on-demand scans. These are the first consumers to make impactful.

Default local search uses FFF. Pinned `@ff-labs/fff-bun` 0.10.5 exposes
`disableWatch`, output watch subscriptions and full rescans, but its inspected
public API has no incremental event-ingestion method. Consolidating that load
requires a native ingestion integration or a deliberately chosen index
replacement. Merely providing an Effect backend will not change Rust's watcher.
Carry this dependency work explicitly; do not distort this library around FFF.

The watcher runs on the filesystem host. A remote OpenCode server uses its own
backend; hosted-workspace drivers need an observation transport. Browsers consume
OpenCode events. TUI-local plugin files may use this package independently on
the client host. This OpenCode baseline has no running Core LSP implementation;
LSP is a future consumer, not a present integration to claim.

## 7. Completion receipt expected from the next session

Report working package entrypoints and example; commit IDs; chosen Effect and
daemon versions; unit/platform/live test commands and results; teardown and
sharing evidence; readiness/loss semantics; and the precise next OpenCode port
step. Separate tested behavior from proposed extensions and skipped live checks.

The desired outcome is a working, reusable Effect backend that OpenCode can
adopt immediately, with recovery semantics explicit enough that broader adoption
does not recreate the old adapter's blind spots.
