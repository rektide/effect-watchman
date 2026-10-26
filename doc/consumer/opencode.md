---
type: ConsumerAccount
title: OpenCode shared Watchman recovery requirements
description: Current OpenCode adoption, outage requirements, reset-contract decision, and deferred application refresh repair.
resource: /doc/consumer/opencode.md
status: proposed
author: GPT-6.1 Sol medium
date: 2026-10-26
sources:
  - resource: "opencode://ses_e87038c1affeHRNE9v4Ggec0Sl"
    title: Inspect owner and host composition, record shared recovery requirements and the reset-contract decision before implementation
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
watch events and readiness through one capacity-one dirty queue with a fixed
100 ms settling window. This does not recover the shared provider or change the
library's existing terminal-loss contract.

## Required provider recovery — not yet implemented

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

## Reset contract decision — awaiting review

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

Neither route is implemented or accepted by this account. OpenCode's explicit
reset-to-invalidate integration is Priority 3, after the provider contract is
selected and verified. Consuming a recovery archive without that integration must
not silently turn existing ordinary streams into apparently continuous streams.

## Deferred application repair — Priority 4

The compatibility worker currently terminates on refresh failure. Repair must
catch at the refresh boundary, preserve last-good skills, retain dirty state and
retry with bounded pacing. Logging and letting the worker die is not recovery.
Existing scan/read failure suppression also needs review: failure must not become
an empty successful inventory. These are application responsibilities, not reasons
for a provider to manufacture successful empty results.

## Evidence still required

Use deterministic private fault peers for absent startup, many-interest disconnect,
accepted-but-silent and idle-wedged sockets, local root rejection/history loss,
flaps, bounded reattachment and prompt shutdown. Exercise actual public exports
and shared watch/query composition. Use only owned private daemons for stock
protocol checks. Archive acceptance and OpenCode outage/rescan tests remain later
evidence; healthy-daemon tests alone do not establish recovery correctness.
