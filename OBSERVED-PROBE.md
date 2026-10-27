---
type: Verification
title: Observed-inventory pairing probe
description: Real private-daemon proof of the query-clock/subscription attachment algorithm proposed for observed inventory, including fresh-history rejection, deletion preservation and epoch-bound rebaseline evidence.
resource: /OBSERVED-PROBE.md
status: verified probe; no public API added
author: GPT-6.1 Sol high
model: openai/gpt-6.1-sol#high
date: 2026-10-27
sources:
  - resource: "opencode://ses_e850fc6dcffe3aMwadZC4zVVwA"
    title: Prove or break the observed-inventory attachment algorithm against the private stock daemon as tests
  - resource: file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-owned-discovery0.gpt6a.md
    title: Proposed observed source contract and the five-step epoch establishment sequence under test
  - resource: file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/library-projections2.gpt6a.md
    title: Proposed initial attachment and whole-root rebaseline under test
  - resource: /src/Connection.ts
    title: Reply and QueryReply decoders and the serialized wire transport the probe drives
  - resource: /src/GlobBackend.ts
    title: The currently write-only query clock checkpoint the proposals want to activate
  - resource: /src/SignalBackend.ts
    title: Existing listener-before-subscribe staging and independent clock-command boundary
  - resource: /src/Backend.ts
    title: Second subscription path with clock boundary and fresh-history failure
  - resource: /src/Owner.ts
    title: Session generations and serial restoration an observed capability would reuse
  - resource: /test/observed.test.ts
    title: The probe suite covering pairing, exists-expression hazard, fresh history, restart, epoch guard and raw fields
  - resource: "file:///home/rektide/archive/facebook/watchman/website/docs/cmd/subscribe.md"
    title: Documented since catch-up equivalence and settling behavior
  - resource: "file:///home/rektide/archive/facebook/watchman/website/docs/cmd/query.md"
    title: Documented is_fresh_instance semantics for since and non-since queries
verification:
  method: Private owned foreground stock daemon (/usr/local/bin/watchman-facebook, 20260708.093114.0) driven through the library Connection; five consecutive focused runs, then the full suite
  scope: Behavioral probe of the proposed attachment algorithm; the observed capability itself remains unimplemented
---

# Observed-inventory pairing probe

`test/observed.test.ts` drives the real private daemon through the attachment
sequence that [source-owned-discovery0 §4](file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-owned-discovery0.gpt6a.md)
and [library-projections2 §4](file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/library-projections2.gpt6a.md)
propose: one lexical baseline query that retains its own clock, a listener
registered before `subscribe`, `since: <query clock>`, staging until the
acknowledgement, and epoch-bound rebaseline. The probe uses the library's own
`Connection` plus one raw socket client for fields the library decoder drops.
No public API was added; this receipt records what the daemon actually does.

Verification: `bun run typecheck` passed; focused suite five consecutive runs
**7 passed × 5, 0 failed** (35), `bun run test:daemon` **11 passed**, full
`bun test ./test` **50 passed, 0 failed**.

## Verdicts on the five probe questions

| # | Question | Verdict | Evidence (test) |
| --- | --- | --- | --- |
| 1 | Query baseline pairs with `subscribe since query.clock`; pre-ack frames staged, consistent result | **Proven** | `query clock pairs a baseline subscription…` |
| 2 | Racing changes between query and subscribe; deletion preserved; recreate present | **Proven** | same test |
| 3 | Fresh history rejects the pairing rather than acting as a delta | **Proven** (two triggers) | `fresh-instance history rejects a fabricated since clock`, `daemon restart invalidates a prior-instance query clock` |
| 4 | Naive replay of an old queued deletion loses a recreated file; epoch guard prevents it | **Proven** (failure mode and guard) | `epoch guard prevents old queued deletion…` |
| 5 | A query clock is a valid `subscribe.since` (exact catch-up, no duplicates, no gaps) | **Proven** | tests 1, 2, 4 jointly |

## What was proven

**The query clock is a valid subscription boundary.** A `query` clock such as
`c:1793064672:4116945:1:3` used as `subscribe.since` delivered exactly the
post-query mutations — deletion of a baseline file, creation, delete+recreate,
and post-ack create/delete — while no baseline-only path (including
`.watchmanconfig` and a file rewritten just before the query) ever appeared on
the subscription side. Baseline-plus-changes projected last-write-wins equals
the settled recursive disk listing. Query and `["clock", root]` clocks share
one format and instance components (`…:1:3` vs `…:1:11`), differing only in
the trailing counter; both begin `c:`. Nothing today consumes the stored query
clock (`src/GlobBackend.ts:18`, `:131-132` — still write-only), and the probe
confirms activating it is sound.

**Pre-ack staging is a real race, not defensive fiction.** The subscribe
acknowledgement usually precedes the initial catch-up frame, but in 2 of 5
runs the catch-up landed in the same socket read as the acknowledgement and
was staged (`staged=1`), because the await continuation runs only after the
synchronous receive loop. The staged frames kept arrival order and were
delivered after the baseline, matching the staging discipline in
`src/SignalBackend.ts:44-51`, `:77-81`.

**Fresh history is observable and must invalidate.** Two deterministic
triggers: a fabricated foreign clock (`c:0:0:0:1`) and a genuine daemon
restart (`--no-save-state`, so no history survives). Both produced
`is_fresh_instance: true` on the subscription, and the since-query on the
restarted daemon also reported `is_fresh_instance: true` with a full
inventory. The probe pairing rejects on the flag whether it arrives with or
after the acknowledgement, as both specs require.

**The exists-expression hazard is live.** Subscribing with the baseline
query's `["exists"]` expression suppressed every `exists: false` row: the
deletion of `victim.ts` was delivered by the unfiltered control subscription
but never by the filtered one, which stayed demonstrably alive. The
spec premise "the update subscription must not inherit the initial query's
`exists` filter" is confirmed against the real daemon.

**The rebaseline counterexample is real and the epoch guard holds.** With the
old subscription's queued `a.ts` deletion frozen mid-queue, the file
recreated, and a new baseline query containing it, naive replay removed
`a.ts` from the new baseline's projection, while epoch-tagged changes
(epoch 1) dropped at the epoch-2 boundary reproduced the disk state exactly.
The old subscription did later deliver the recreation — correctness must not
depend on that tail arriving, which is precisely the guard's point.

**Subscription rows can carry lexical type.** With
`fields: ["name","type","exists","new"]` the daemon returns `type` on present
rows (`"f"`) and accepts the extended field list without error, so the
proposed `Reply.files` extension is wire-compatible. See the surprise below
for what deletion rows actually carry.

## Surprises and corrections to the proposals

1. **Fresh-instance frames are not empty deltas.** The fresh response carried
   the entire existing inventory, every row `new: true` (fabricated-clock
   frame: `.watchmanconfig` + `a.ts`; restart since-query:
   `.watchmanconfig`, `a.ts`, `outage.ts`). An implementation that applied
   rows before checking `is_fresh_instance` would re-add everything; the
   rejection must precede any row application, which the proposals say but
   now have daemon evidence for.
2. **Deletion rows carry a stale lexical type.** The raw probe observed
   `{"new":false,"exists":false,"type":"f","name":"doomed.ts"}` — `type` is
   present on `exists: false` rows and describes the pre-deletion state.
   library-projections2's "deletion metadata may be absent" is wrong in the
   opposite direction: it can be present but stale. Decoders must ignore
   `type` (and any metadata) on `exists: false` rows rather than trust it.
3. **`is_fresh_instance` on a plain baseline query is always true.** Observed
   on every non-since query, matching the query documentation ("for all other
   queries, is_fresh_instance will always be true"). This flag must never be
   read off the baseline reply to judge pairing validity — a trap neither
   proposal calls out.
4. **Delete+recreate coalesces to one row with an unstable `new` flag.** The
   recreated file surfaced as a single `exists: true` row whose `new` value
   varied between runs (`true`/`false`) with identical file states. Nothing
   may key off `new` for recreate semantics; only `exists` is stable.
5. **Stale unix socket files outlive a killed daemon.** A replacement daemon
   on the same path left the old socket file, so file existence is not
   readiness; the harness now probes a real connection. Relevant to any
   future recovery tooling that assumes socket-path liveness.

## What did not break

The five-step sequence is implementable exactly as written: listener before
subscribe, `since: query.clock`, staging until acknowledgement, baseline
published before staged changes, fresh history rejecting the pairing, and
rebaseline through the same path with old-epoch work dropped. No premise of
the attachment mechanism itself was falsified; the corrections above are
about decoding details and one always-true flag.

## Next implementation step

Build the observed-inventory module on the shared Owner (`src/Owner.ts`)
using the probe's pairing shape: reuse the `GlobBackend` query path (minus
local supplementation) to obtain baseline + clock, register the listener
before `subscribe since query.clock` with `fields: ["name","type","exists","new"]`,
stage epoch-tagged rows until the acknowledgement, reject on
`is_fresh_instance` before applying any row, and extend `Connection.Reply.files`
(`src/Connection.ts:15-17`) with optional `type`/`size`/`mtime_ms` decoding —
ignoring stale metadata on `exists: false` rows. The write-only checkpoint
WeakMap in `src/GlobBackend.ts:18` can then be replaced by the observed
view's retained clock.
