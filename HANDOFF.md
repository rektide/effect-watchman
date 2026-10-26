---
type: Handoff
title: Independent additive Watchman
description: Current enumeration implementation receipt followed by preserved watch-only history.
resource: /HANDOFF.md
status: active
author: GPT-6.1 Sol xhigh
date: 2026-10-19
sources:
  - resource: "opencode://ses_e87038c1affeHRNE9v4Ggec0Sl"
    title: Record the new shared recovery receipt and distinguish it from preserved terminal-owner history
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Added the current enumeration receipt without replacing earlier watch verification history
  - resource: /ENUMERATION.md
    title: Maintained enumeration API and limits
---

# Build handoff: independent additive Watchman

## Shared recovery extension — 2026-10-26

Implementation `21b13955` with stable-health correction `bfab3158` adds one scoped generation/reconnect/serial-restore/idle-probe
controller, passive health and the optional checked `Recovery.fileSystem` signal
capability. Initial/recovery acknowledgement precedes resets and later hints;
history loss can reset within a generation. Ordinary watching still fails on loss.
The older statements below that an owner remains terminal now describe history,
not the current owner. See [the recovery API](RECOVERY.md) and
[OpenCode's consumer account](doc/consumer/opencode.md) for the selected boundary,
startup degradation, bounded cleanup budgets and remaining application obligations.

`bun run typecheck` passed. Full tests with the owned private stock daemon:
**42 passed, 0 failed**, including ten new fault-peer cases and signal attachment
in the existing daemon suite. All ten fault-peer cases also passed 10 randomized
repetitions (**100 passed**, seed `1138966675`). OpenCode signal-to-invalidate
mapping, application last-good scan retry and built-host outage acceptance remain
separate priorities. No ambient daemon/service operations were used.

## Enumeration extension — 2026-10-19

`Glob.layer` and `Watchman.layerWithGlob` implement selective daemon glob queries
and complete baselines, not merely watch-ignore globs. Exact approved-root
acquisition, query-specific decoding, byte/deadline budgets, shared watch/query
ownership, npm-backed traversal, explicit local coverage/symlink supplementation,
and scanned versus checkpointed classification are implemented. See
[the maintained API](ENUMERATION.md) and [contract checkpoint](design/watch/enumeration-contract0.sol61x.md).
The no-inventory/no-recursive-symlink statements below apply to the preserved
watch-only interfaces, not this new optional enumeration surface. Aligned changes,
catch-up and automatic reconnect remain unimplemented. Earlier verification
counts below are historical receipts, not the enumeration suite's current totals.

2026-10-10, GPT-6.1 Sol. Architecture gate and executable backend seam landed.
The user-selected additive `fs.watch(path, options)` direction supersedes the
mandatory acquired-observation / Plus-owned sole-adapter design at `a31fda8d`.
Do not restore that design as a constraint.

## Current implementation

### Glob integration receipt — current v2

Both checked accessors now require **`~effect-watch/options/v2`** and reject
missing/literal-only v1 markers. Exact runtime dependency **minimatch 10.0.3**;
literal subtrees and whole-path globs compile once per consumed subscription.
See [IGNORE.md](IGNORE.md) for exact syntax, anchoring, malformed-pattern and
escape policy. OpenCode's ConfigWatch ignore list is supported. Filtering is
userland/path-only and preserves deletion selection without stat/exists.
Identical cases run through native Plus and this real isolated stock backend.
Connection, backend lease and sibling cancellation behavior are unchanged.

### Integration caveats (current)

- Initially missing targets fail; `followReplacements` requires an existing file.
  Atomic replacement of that lexical file is covered while its parent remains
  watched. Parent/root/ancestor replacement has **no detection/recovery guarantee**;
  known daemon cancellation/loss fails rather than fabricating a root Update.
- No readiness, initial inventory, catch-up or reconnect API. Terminal connection
  failure requires **rebuilding the Layer in a new scope**; retrying watches on
  the existing owner does not repair it. Reconcile before reopening after loss.
- No recursive symlink traversal or writes-through-file-symlink following promise.
  Canonical directory routing preserves logical paths, not arbitrary symlink topology.
- Daemon ignore_dirs/ignore_vcs constrain coverage. Limits/overflow are explicit;
  userland ignores do not reduce transport delivery pressure. Native callback
  setup/null-name/buffering limitations still apply if the application also uses
  native Plus; no end-to-end bound is promised there.
- No gitignore/Parcel equivalence. Reusing a backend Layer shares its connection
  and cached project acquisition, not merged overlapping subscriptions. Roots
  remain daemon-owned. No broader resource-sharing guarantee is introduced.

Final verification: `bun run typecheck` and `bun run build` passed in both repos.
`WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook
WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test`: **24 passed** here,
including the private stock daemon; Plus native suite: **23 passed**. Focused
POSIX/Windows normalization, validation and file-anchor checks also passed.
Older receipts below are historical; this section supersedes their v1/no-glob
statements.

`import { Watchman } from "effect-watchman"` exposes built ESM/declarations:

- `fromBackend`: Layer capturing Effect FileSystem, Path and WatchBackend,
  replacing only watch and **never calling captured fs.watch**.
- `make(fs, path, backend)`: pure direct backend composition.
- `fileSystem`: checked enhanced typed view returning the same object at Effect's
  FileSystem key. Ordinary watch syntax with `recursive`, literal subtree/glob
  `ignore`, and existing-file `followReplacements` options.
- Explicit failure on declined registration, stream completion and errors.
  No native fallback, fabricated root Update or transparent retry through loss.
- One captured backend owner shared in the tested real Node Layer/direct route;
  individual streams own independent scopes. No manager duplication or Plus
  runtime/dependency.
- Exact Effect 4.0.1 peer/test baseline and portable build/scripts/exports.

## Implemented daemon stage (2026-10-10)

`Watchman.layer({ socketPath })` is now a usable scoped enhanced filesystem;
`Watchman.backendLayer({ socketPath })` is the ordinary Effect backend. Reuse the
same backend Layer value for NodeFileSystem construction and `fromBackend` to
share one connection. Explicit JSON-line Unix transport, schema decoding,
serialized bounded commands, cancellation-first decoding, latched terminal loss,
bounded deadlines/framing/delivery and independent subscriptions are implemented.
`watch-project` canonical routing / logical absolute paths, clock/since boundaries,
exists/new mapping, direct/file/recursive selection and cookie filtering are real.
Same-directory project acquisition is cached; daemon root sharing is delegated to
watch-project. No merged-overlap subscription optimizer or root unwatch is added.

Live test command is documented in README and package `test:daemon`. Verified
against `/usr/local/bin/watchman-facebook`, stock version 20260708.093114.0,
build 54602bcad27e0887fd26f77c6747a38f0d701fc7, in a private owned foreground
daemon. First vertical run: **7 passed**, including the daemon lifecycle test.
No ambient daemon/service contact, publishing or push.

Deterministic scripted-peer keepers now cover rejected attach cleanup, mismatched
reply settlement of active/queued commands, cancellation-first decoding, split
UTF-8 / multi-frame delivery, malformed JSON/schema/UTF-8, frame overflow, silent
deadline, queued cancellation, subscribe interruption, silent unsubscribe and
latched bounded delivery overflow. Public disconnect/fresh-history/overflow remain
typed stream failures. Loss is not overwritten by subsequent scope cleanup;
registration after a concurrent terminal failure is typed rather than a defect.
Full run: **17 passed**, no failures, including private real daemon; `bun run
typecheck` and `bun run build` passed. Live fixture also checks ordinary file
selection and canonical symlink-directory routing back to absolute logical paths.

Remaining capabilities: no readiness/catch-up/inventory API, inode-preserving file
identity, ancestor acquisition for missing targets, parent/root replacement,
merged-overlap subscription optimization, reconnect, portable cursors, discovery,
autospawn or daemon expression pushdown. Root watches outlive the client socket
because the daemon owns them; only named subscriptions and the client connection
are disposed. Any further topology/catch-up/marker evolution belongs to a separate
architecture decision, not this completed daemon stage. Stop here for parent review.

## Focused cancellation repair

Parent review found command AbortSignal cancellation terminally failed the shared
connection, including unsent work. Regression at predecessor `7832cd77`: A attached,
B's subscribe reply delayed, then B interrupted. B cleanup never sent unsubscribe;
A's connection was failed. A second keeper interrupted the first cached
watch-project requester while another consumer awaited that acquisition; the
sibling never attached. Both failed before the repair (proof commit `5bc1d862`).

Repair separates caller cancellation from serialized wire ownership. Unsent
commands are removed from the bounded queue; transmitted commands retain their
reply/deadline owner while their caller can stop. Consumer finalizers queue
unsubscribe, including after a late subscribe acknowledgement, suppressing all
B delivery while A remains live. Cleanup queue wait is bounded by request +
cleanup timeout, with the cleanup deadline applied separately after transmission;
thus a cleanup timer does not prematurely cut off a still-valid subscribe reply.
Real wire/cleanup silence and corruption still fail the shared connection. Cached
project acquisition belongs to the scoped manager, never its first caller's signal.

No reconnect was introduced. After terminal connection failure, this manager/layer
instance remains terminal; retrying fs.watch on it is not recovery. Reconcile and
rebuild the layer in a new scope. Local consumer-only loss need not kill the
connection. Watch options and the v1 marker remain unchanged.

Repair verification: `bun run typecheck` and `bun run build` passed;
`WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook
WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test` passed **20 tests,
0 failures**. Includes the real owned private daemon lifecycle test, delayed B
acknowledgement beyond its cleanup wire timeout while A remains live, no B hints,
late B unsubscribe, cached-acquisition sibling survival, unsent cancellation with
queue-capacity reuse, and silent-wire deadline after caller interruption.

Commits: gate `c6f11e13`; package baseline `8a5313d4`.
Plus gate `ebdc5af0`; native baseline `481abfcc`.

## Evidence

`bun run typecheck`, `bun run build`: passed.
`WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test`: **6 tests passed**.
Pinned Effect/platform-node/shared 4.0.1, Bun 1.4.2/Linux. Real Node filesystem
Layer selects the captured backend. Direct path applies nested subtree ignores
and tombstones, routes stable files to their parents, never calls native watch,
fails on None/known close/loss, and releases sibling streams independently.

Both package tarballs installed into a separate consumer project with only public
imports: **3 tests + strict typecheck passed**. One consumer used Plus's checked
accessor on Watchman with no Plus decorator, and both packages resolved its one
Effect identity. Source/evidence maintained in the Plus checkout at
`design/watch/{consumer-proof.test.ts,additive-gate.md,contract.md}`.

## Original daemon-stage checklist (implementation above supersedes future tense)

1. **Transport**: explicit Unix socket; scoped immediate acquisition; serialized
   owned command Deferreds; Schema validation at the wire boundary; split UTF-8
   and multi-frame handling; per-frame limits; separate connect/command/cleanup
   deadlines. Settle every pending reply exactly once on terminal failure.
2. **Manager/backend**: one Layer-owned endpoint/root manager; independent scoped
   subscription leases. Produce ordinary watch hints from supported `new`/exists
   metadata and since boundaries, not initial inventory. File/entries/recursive
   selection, logical/canonical mapping, no escaping paths, suppress cookies.
   Backend errors must be typed; forced Watchman never returns None on failure.
3. **Direct enhancements**: retain the same `fs.watch` option vocabulary, optimized
   safe pathname pushdown plus residual filtering; keep deletion tombstones.
   No Plus runtime/decorator needed. Review whether the direct seam should call
   richer manager methods once pushdown/catch-up are implemented. Keep one owner.
4. **Continuity and disposal**: ordinary stream fails when continuity is unknown:
   disconnect, cancellation, fresh history, local overflow or unrecoverable gap.
   Own/bound buffers and latched failure. Retry only at one declared owner; no
   successful disturbance attempts or unbounded close waits.
5. **Isolated daemon conformance**: parent inventories an isolated daemon path.
   Public create/edit/delete, nested/direct scope, atomic save + later edit,
   read-only quietness, attachment cancellation, sibling release, loss and cleanup.
   Record daemon version; never restart shared daemons or the operator's service.

Stronger attach/inventory/catch-up helpers are optional later operations, not a
mandatory high-level observation replacement. Subscribe acknowledgement is not
an initial baseline or content snapshot. An empty first push is not an attach
condition. Catch-up returns changed current states and retained tombstones, not
every operation. Bind opaque clocks to endpoint/root generation/scope/filter;
fresh history requires reconciliation, not pretending historical deletions exist.

## Keeper failures from the old frozen carrier

Do not transplant old transport wholesale. Reference repository:
`/home/rektide/src/opencode-watchman`; frozen commit
`dd4b8ba8c2dd6c859ecd11b42493e4fbddf4fc02`, bookmark
`watchman-20261010-pre-rework`. Use `jj file show` for its
`packages/core/src/filesystem/watchman/{session,protocol,mapping,directory}.ts`.

| Prior failure | Required keeper |
| --- | --- |
| Attach rejection leaked sockets | Resource scoped before capability/attach; failure and cancellation destroy it. |
| Mismatched reply left Deferred pending | Validate reply before clearing ownership/deadline; fail/settle exactly once. |
| `{unilateral:true,canceled:true,...}` decoded as empty push | Decode cancellation before ordinary subscription pushes. |
| Disturbance returned success; reconnect thrashed | Transient failure enters bounded backoff, with meaningful reset condition. |
| Silent peer made close hang | Bounded cleanup, then local socket destruction. |
| Consumer lost invalidation/deletions | Known loss latched as failure or explicit optional reconciliation protocol; never droppable ordinary hint. |

Old scratch scenarios remain at `/home/rektide/tmp-opencode/watchman-review-probes.ts`
and `watchman-review-consumer.ts`; convert scenarios into maintained keeper tests.
Do not generalize an old daemon read→update feedback bug into a present guarantee;
repeat read-only quietness against each supported pinned daemon.

## Architectural review and limits

Review before expanding: richer direct manager-to-watch seam versus ordinary
WatchBackend, capability marker/version evolution, root replacement topology,
continuity/catch-up semantics, bounded delivery and optional coherent inventory.
No Git-ignore equivalence, operation journal, exactly-once delivery,
rename identity, atomic content snapshot, recursive symlink traversal, portable
cursors, overlap optimizer, daemon autodiscovery or autospawn is promised.
Respect root ignore_dirs/ignore_vcs coverage; do not rewrite daemon configuration.
No `exists` filter on incremental expressions: it hides deletion tombstones.

Pinned Effect Node stats before backend registration and captures backend at Layer
construction. This baseline also fails on missing targets. Future topology policy
can use existing ancestors but must state the acquisition/loss limit honestly.
No universal native attachment barrier fits in the ordinary event union.

References: [subscribe](https://facebook.github.io/watchman/docs/cmd/subscribe),
[query](https://facebook.github.io/watchman/docs/cmd/query),
[watch-project](https://facebook.github.io/watchman/docs/cmd/watch-project),
[clockspec](https://facebook.github.io/watchman/docs/clockspec),
[config](https://facebook.github.io/watchman/docs/config).

Commit coherent stages with jj. Parcel and OpenCode source edits, live/shared
daemon/service restarts, pushing and publishing are outside this assignment.
