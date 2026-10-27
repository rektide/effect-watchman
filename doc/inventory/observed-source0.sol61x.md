---
type: ImplementationReceipt
title: Public observed inventory — Gate A
description: Same-session query-clock subscription, bounded epoch delivery, explicit reset and retained-view transport recovery.
resource: /doc/inventory/observed-source0.sol61x.md
status: implemented and locally verified on Linux
author: GPT-6.1 Sol xhigh
model: openai/gpt-6.1-sol#xhigh
date: 2026-10-27
sources:
  - resource: "opencode://ses_e84c4d1f6ffeiIscq0sLlVo9iS"
    title: Build Gate A's real public API, scripted protocol tests and private-daemon restart verification
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-owned-design0.glm53m.md"
    title: Accepted source contract, clock joining, ordering, budgets and Gate A acceptance
  - resource: /OBSERVED-PROBE.md
    title: Preserved de-risk evidence and row-semantics corrections
  - resource: "file:///home/rektide/src/effect-watch-plus/doc/inventory/contract0.sol61x.md"
    title: Owning backend-neutral contract
  - resource: /src/Inventory.ts
    title: Scoped observed view implementation
  - resource: /src/Owner.ts
    title: Shared session owner and revision-aware interest refresh
  - resource: /src/GlobBackend.ts
    title: Shared lexical query and decoder; retired write-only checkpoint map
  - resource: /test/inventory.test.ts
    title: Deterministic protocol, staging, overflow, reset and owner isolation tests
  - resource: /test/inventory-daemon.test.ts
    title: Actual public view across raced mutations, fresh history and private-daemon restart
---

# Public observed inventory

`Inventory` is exported from `effect-watchman`. `Glob.layer(options)` and
`Watchman.layerWithGlob(options)` install the inventory capability on their
existing shared owner. `Inventory.fileSystem` obtains its `InventorySource`.
The structural types and capability identity come from the peer
`effect-watch-plus/inventory`, not a second independent definition.

```ts
const source = yield* Inventory.fileSystem
const view = yield* source.open({ root: absoluteApprovedRoot })
yield* view.events.pipe(Stream.runForEach(consume))
```

The caller owns the open scope. Events have one consumer; stopping that consumer
does not close the retained view. Scope release unregisters the interest,
removes its callback immediately and attempts bounded unsubscribe. The source
checks canonical approved placement at acquisition. A missing/non-directory,
unapproved or daemon-excluded requested root fails; it never falls back locally.
Configuration is read on each epoch, not monitored for arbitrary client edits.

One captured session acquires the approved root, reads configuration, performs
the lexical query and subscribes with that query's clock. Query and baseline
decoding share `GlobBackend` machinery. The finite query's write-only checkpoint
WeakMap is removed; finite opaque checkpoint tokens retain their old shape.
Observed views retain the actual boundary in their subscribe operation.

The subscription has no exists expression. The listener precedes subscribe;
pre-ack changes stage under row and byte bounds. A fresh frame is rejected before
decoding any of its rows. Repeated fresh pairings exhaust an explicit paced
attempt budget. A late fresh response invalidates the acknowledged baseline
before requesting another attach. Only exists classifies rows; deletion metadata
is ignored, present lexical type is checked, and `new` has no semantic role.

Invalidation advances the view epoch immediately, aborts obsolete acquisition,
removes the old listener and clears queued old events. Rebaseline and reconnect
reuse one interest. Owner interest revisions prevent a reset during attachment
from being overwritten by that attachment's completion. In-flight wire replies
retain the existing Connection ownership discipline until settled.

Defaults per open: 16,384 queued change rows, 8 MiB serialized change bytes,
32 MiB baseline response bytes (or `maxQueryBytes`), three pairing attempts,
100 ms retry pace. Overflow is terminal, clears buffered events and releases the
interest. Later consumers must open a fresh view. Query timeouts continue to use
the existing configured query/sync/lock budgets. Baseline bytes are independently
bounded by the query response cap and transport frame cap.

Optional Effect spans: open, attach and rebaseline; no filenames in attributes.
No new exporter or instrumentation runtime is installed.

## Verification

- `bun run build`, `bun run typecheck`.
- `WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook WATCH_TEST_DIRECTORY=/tmp/opencode bun test ./test`:
  **57 passed**, including the unchanged seven-test probe, before adding the
  reset-during-query regression. Focused source tests then passed **70/70**
  (seven cases repeated ten times); the private-daemon public API passed **10/10**.
- Scripted real-socket tests cover exact clock use, no subscription expression,
  forced pre-ack delivery, exists-only removal, fresh rejection before rows,
  bounded retries, single consumer, old callback isolation, cleared queued
  deletion, same-view reconnect, row/byte overflow, excluded-root diagnosis and
  continued sibling finite-query use after view failure.
- The private stock daemon test uses the public API through a fixture proxy.
  Real disk writes occur between query and subscribe; the proxy places the real
  catch-up frame before its real ack to exercise staging deterministically.
  A foreign since clock forces actual fresh history. Delete/recreate rebaseline
  restores membership; `--no-save-state` restart produces invalidation, a new
  baseline and subsequent live changes on the **same** view without caller reopen.
  Both recovery logs and scripted coverage show one retained interest, not a
  parallel projection.

These are Linux checks, not Windows/macOS runtime proof. Already-consumed events
cannot be recalled; downstream native builders must still check epochs. There
is no cross-process replay or cursor promise. Host adoption and artifact refresh
remain Gate D and were not edited here.
