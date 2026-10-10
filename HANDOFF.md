# Build handoff: independent additive Watchman

2026-10-10, GPT-6.1 Sol. Architecture gate and executable backend seam landed.
The user-selected additive `fs.watch(path, options)` direction supersedes the
mandatory acquired-observation / Plus-owned sole-adapter design at `a31fda8d`.
Do not restore that design as a constraint.

## Current implementation

`import { Watchman } from "effect-watchman"` exposes built ESM/declarations:

- `fromBackend`: Layer capturing Effect FileSystem, Path and WatchBackend,
  replacing only watch and **never calling captured fs.watch**.
- `make(fs, path, backend)`: pure direct backend composition.
- `fileSystem`: checked enhanced typed view returning the same object at Effect's
  FileSystem key. Ordinary watch syntax with `recursive`, literal subtree
  `ignore`, and existing-file `followReplacements` options.
- Explicit failure on declined registration, stream completion and errors.
  No native fallback, fabricated root Update or transparent retry through loss.
- One captured backend owner shared in the tested real Node Layer/direct route;
  individual streams own independent scopes. No manager duplication or Plus
  runtime/dependency.
- Exact Effect 4.0.1 peer/test baseline and portable build/scripts/exports.

**Transport, manager and actual daemon backend are NOT implemented.** The current
fromBackend layer requires a supplied backend. Fixtures prove the seam, not a
usable daemon connection. First-cut native/Plus functionality is separately real.

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

## Next stage for Sol Medium, parent-coordinated

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
No arbitrary glob/Git-ignore equivalence, operation journal, exactly-once delivery,
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
