---
type: ConsumerAccount
title: OpenCode shared Watchman recovery requirements
description: Current OpenCode adoption, host reset integration, last-good application refresh policy and remaining composed acceptance evidence.
resource: /doc/consumer/opencode.md
status: active
author: GPT-6.1 Sol medium
date: 2026-10-26
sources:
  - resource: "opencode://ses_e86eae12dffeSU0n3uUoqScW0i"
    title: Implement host recovery selection/readiness and last-good paced application refresh; distinguish remaining composed acceptance
  - resource: "file:///home/rektide/src/opencode-watchman/.design/watchman/recovery-host0.sol61m.md"
    title: Host-scoped optional recovery selection and acknowledged ordered readiness verification
  - resource: "file:///home/rektide/src/opencode-watchman/.design/watchman/refresh-safety0.sol61m.md"
    title: Application last-good snapshots, strict scan failures, filtering and bounded dirty retry receipt
  - resource: "opencode://ses_e87038c1affeHRNE9v4Ggec0Sl"
    title: Implement and verify shared owner recovery and additive signals; record the parent decision and deferred application obligations
  - resource: "opencode://ses_e870ad63fffepjINA5vdd58LWO"
    title: Parent selects additive checked typed signals, passive health and preserved ordinary-stream failure on loss
  - resource: /README.md
    title: Public additive watch composition and current terminal-loss contract
  - resource: /design/watch/additive-gate.md
    title: Preserve ordinary filesystem events and optional coherent helpers rather than a mandatory observation service
  - resource: /src/Owner.ts
    title: Current shared connection and project cache
  - resource: /src/Backend.ts
    title: Current subscription ownership and history-loss failure
  - resource: /src/GlobBackend.ts
    title: Queries currently capture the same owner connection
  - resource: "file:///home/rektide/src/opencode-watchman/.design/watchman/incident-safety0.gpt6a.md"
    title: OpenCode incident safety priorities and acceptance requirements
  - resource: "file:///home/rektide/src/opencode-watchman/packages/util/src/filesystem-watch.ts"
    title: Host selection, shared provider construction, and explicit native shallow interests
  - resource: "file:///home/rektide/src/opencode-watchman/packages/core/src/filesystem/watcher.ts"
    title: Native invalidation/readiness seam and current failure shutdown
  - resource: "file:///home/rektide/src/opencode-watchman/packages/core/src/config/plugin/compatibility.ts"
    title: Priority 1 retained-watch and unified refresh worker implementation
---

# OpenCode consumer account

## Implemented adoption

OpenCode consumes revision-named package archives, not source-checkout or installed
dependency edits. Its host constructs one provider for watching and, when roots
are explicitly approved, enumeration. Selection precedes execution: shallow native
interests and out-of-scope enumeration are declared routes, not outage fallback.
See the [host integration](file:///home/rektide/src/opencode-watchman/.design/watchman/library-integration0.sol61x.md)
and [incident safety priorities](file:///home/rektide/src/opencode-watchman/.design/watchman/incident-safety0.gpt6a.md).

Priority 1 in OpenCode retains compatibility watches and routes raw config updates,
watch events and readiness through one capacity-three dirty queue with a fixed
100 ms settling window. Priority 3 maps the optional archive signal stream through
a host-scoped selector to Core invalidation/readiness, including acknowledged
initial attachment. Ordinary filesystem watch semantics remain terminal on loss.
⇄ [Host receipt](file:///home/rektide/src/opencode-watchman/.design/watchman/recovery-host0.sol61m.md).

## Required provider recovery — implemented in the library

Implementation `21b13955` and stable-health correction `bfab3158` supply the following lifecycle. ⇄
[Recovery API](/RECOVERY.md) owns its public contract, limits and evidence. OpenCode
now maps these signals to invalidation, but full composed outage convergence is
still a separate acceptance obligation.

- One scoped owner controller reconnects and probes; no per-consumer retry loops.
  Generations bind connections, cached roots and attachments. Query/watch sharing
  survives replacement, but queries interrupted by loss fail visibly.
- Jittered exponential delays cap sustained-outage attempts; brief successful
  connections do not reset backoff. Reset only after stable health. Cancel waits,
  sockets and restoration when the owner scope closes.
- Bound connect, command, cleanup and idle-socket liveness waits. Restore desired
  subscriptions with bounded concurrency rather than filling the command queue.
- Root rejection and subscription history loss are local, not reasons to rebuild
  healthy siblings. Transport corruption, closure and liveness failure invalidate
  a connection generation.
- Expose owner state and aggregate outage/recovery diagnostics, not one warning
  loop per interest. No automatic native fallback or daemon autospawn.
- Reestablishment is not continuity: a replacement attachment must deliver an
  explicit reset boundary before later events. Events arriving while the consumer
  rescans need bounded buffering; overflow must remain visible.

## Reset contract decision — option 1 selected by the parent

The ordinary Effect `FileSystem.WatchEvent` union has no reset case. The existing
[additive gate](/design/watch/additive-gate.md) explicitly rejects fabricated root
updates and a mandatory observation service. Two additive routes remain possible:

1. **Optional typed signal stream (recommended):** expose a checked Watchman
   filesystem capability for watch signals and owner health. Signals distinguish
   attachment/reset from file events and carry connection generation plus a local
   reset sequence (history can be lost without changing the connection). Ordinary
   `fs.watch` keeps failing visibly on continuity loss. The opt-in stream retains
   desired interests across transport recovery. No transport service is exposed,
   and existing layer/fromBackend/make/watch-query composition remains usable.
2. **Optional reset callback on enhanced watch options:** resume a watch only for
   consumers supplying the callback, running it after attachment and before
   later event delivery. Ordinary callers still fail on loss. This keeps the
   event type but requires carrying the enhanced option through the captured
   backend seam and specifying callback failure, retry and cancellation semantics.

The parent selected option 1; it is now implemented as `Recovery.fileSystem` on
the existing filesystem object. Option 2 remains an unselected alternative, not a
second implementation. OpenCode's explicit reset-to-invalidate integration is
implemented and verified independently. Consuming a recovery archive without that integration must
not silently turn existing ordinary streams into apparently continuous streams.

## Application repair — Priority 4 implemented

OpenCode's configuration, skills, compatibility skills, and agent/command directory
catalog workers now catch non-interruption failures at their refresh boundary,
retain last-good published state and retry a dirty transaction after a fixed one
second delay. Three sliding tokens coalesce a batch; changes during a scan or retry
remain dirty. One warning marks a failing episode; subsequent failed attempts log
at DEBUG. No provider command retry or native fallback is added.

Directory/glob/read errors no longer become successful empty skill or agent/command
inventories. True missing/deleted paths still clear entries. Optional native
inaccessible candidates retain their existing absence policy until selected; loss
of access to selected configuration documents/discovery roots fails the transaction
and retains their last-good snapshots. `Config.compatibility()` now reads the
committed root snapshot, not a fresh error-suppressing existence filter.

Relevant raw compatibility updates and changed compatibility-root snapshots request
refreshes; unrelated config updates do not. A readiness rescan with identical skills
does not republish the skill catalog, but failed catalog publication remains pending
until a successful retry. ⇄ [Application receipt](file:///home/rektide/src/opencode-watchman/.design/watchman/refresh-safety0.sol61m.md)
records deterministic failure/recovery tests and their limits. These are host
responsibilities, not reasons for the library to manufacture empty results.

## Evidence still required

Use deterministic private fault peers for absent startup, many-interest disconnect,
accepted-but-silent and idle-wedged sockets, local root rejection/history loss,
flaps, bounded reattachment and prompt shutdown. Exercise actual public exports
and shared watch/query composition. Use only owned private daemons for stock
protocol checks. Library and packed-provider host tests already cover several of
these boundaries; full config/skills/provider composition and a built-binary private
daemon smoke remain Priority 5. Healthy-daemon tests alone do not establish recovery
correctness. No live service was operated for these changes.
