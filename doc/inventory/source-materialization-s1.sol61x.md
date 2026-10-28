---
type: ImplementationReceipt
title: Source materialization S1 — linear JSON framing and measured residual
description: Protocol-preserving linear framing, bounded private diagnostics, cached decoders and finite comparator, observed-sort removal, correctness gates and all 18 direct-daemon control/S1 measurements.
resource: /doc/inventory/source-materialization-s1.sol61x.md
status: draft
author: GPT-6.1 Sol
model: openai/gpt-6.1-sol#xhigh
date: 2026-10-27
sources:
  - resource: "opencode://ses_e7c90f1d6ffeviS28mp5Msdsk1"
    title: Bind historical S1 connection/framing evidence to its preserved revision after the dual-backend extraction cutover; add current owner pointer without changing measurements
  - resource: "opencode://ses_e809723ffffe8kD6j9UHE5XIV7"
    title: S1 source builder implements and tests linear framing and ordering clarification, measures committed control and S1 in 18 fresh processes, and returns the remaining synchronous-work checkpoint
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-materialization-handoff0.gpt6a.md"
    title: Commission, retained contracts, exact framing requirements and bounded S1 return
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-owned-design0.glm53m.md"
    title: Accepted source authority, clock pairing, epoch and failure contracts
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/background-admission-host0.sol61x.md"
    title: Prior direct source/controller 200–203 ms gap and churn sequence, not a library-only control
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/bser-bench0.sol61x.md"
    title: Separate wire benchmark, framing amplification and daemon first-byte evidence
  - resource: "https://github.com/rektide/effect-watchman/blob/bd893c6d54db799a57861c917b4644106247cdd0/src/Connection.ts"
    title: Unchanged synchronous correlation and validation flow using cached decoders and linear framing
  - resource: "https://github.com/rektide/effect-watchman/blob/bd893c6d54db799a57861c917b4644106247cdd0/src/Framing.ts"
    title: Segmented incomplete frame, bounded small-fragment pages and logical copy/scan counters
  - resource: /src/Diagnostics.ts
    title: Private opt-in fixed-cardinality aggregates and bounded numeric samples
  - resource: /src/Inventory.ts
    title: Observed lexical conversion without incidental baseline sorting
  - resource: /src/GlobBackend.ts
    title: Finite sorted output with cached English collation
  - resource: /src/Owner.ts
    title: Preserved shared-session restoration and idle probe ownership
  - resource: "file:///home/rektide/src/effect-watch-plus/src/Inventory.ts"
    title: Owning structural baseline contract has no array-order promise
  - resource: "file:///home/rektide/src/fff/packages/effect/src/Controller.ts"
    title: Controller hands supplied baseline membership to createScoped without requiring input order
  - resource: "file:///home/rektide/src/fff/crates/fff-core/src/inventory.rs"
    title: from_candidates sorts supplied membership before validating ancestry and construction
  - resource: /ENUMERATION.md
    title: Retained sorted and deduplicated finite output, byte budgets and query-local failures
  - resource: /RECOVERY.md
    title: Retained attachment, cancellation, continuity and probe contracts
  - resource: /README.md
    title: Maintained observed inventory ordering clarification
  - resource: /HANDOFF.md
    title: Historical transport and cancellation regression obligations
  - resource: /doc/inventory/observed-source0.sol61x.md
    title: Predecessor Gate A semantics and verification
  - resource: "https://github.com/rektide/effect-watchman/blob/bd893c6d54db799a57861c917b4644106247cdd0/test/framing.test.ts"
    title: Deterministic linearity, storage, split-byte, limit and terminal-release tests
  - resource: /test/transport.test.ts
    title: Fatal UTF-8/JSON, wire ownership, cancellation and multi-frame regression tests
  - resource: /test/query-transport.test.ts
    title: Rich/name-only/null row decoding and operation-local failure isolation
  - resource: /test/inventory.test.ts
    title: Epoch/clock/fresh-history regressions and new observed-versus-finite ordering keeper
  - resource: /test/recovery.test.ts
    title: Shared recovery, deadlines, idle probing and sibling behavior
  - resource: /test/inventory-daemon.test.ts
    title: Real public clock join, staged race, fresh history and retained-view restart
verification:
  method: Build and typecheck, 72-test full private-daemon suite, 480 focused repetitions, operation-count framing proofs and 18 serial fresh-process real-file direct-source measurements
  scope: Linux x64 Bun 1.4.4 and private stock Watchman only; S1 synchronous incumbent JSON-lines implementation; independent G review pending; no host, Git, FFF or BSER implementation
---

# Source materialization S1

**2026-10-28 ownership addendum:** the JSON connection/framer now lives in
`watchman-client-json`; the three historical wire/framing sources above are bound
to the preserved S1 revision rather than their removed/replaced local paths.
The [dual-backend receipt](/doc/dual-backend0.sol61x.md) records that extraction
cutover and the BSER choice. No S1 measurement or performance claim below is rerun
or reinterpreted by this ownership update.

**S1 is implemented; the 50 ms working long-task target is not met.** Initial
100k framing copy/scan falls from **94.35–103.01 MB to 8.10 MB**, and the redundant
**99–120 ms** observed sort disappears. The library-only route's maximum heartbeat
gap falls from **204.67–220.77 ms to 88.41–127.41 ms**. Remaining synchronous
schema/JSON/lexical work justifies returning for the parent's S2 decision, not
silently introducing an async queue or a different parser.

## Revisions and API delta

Started clean at commissioned parent **`bcf91102`**. Coherent commits:

| Revision | Contents |
| --- | --- |
| `97c5e2ae` | Bounded private phase attribution on the unchanged algorithm; measured control. |
| `c8bd6841` | Linear segmented JSON-line framer, reusable fatal UTF-8 and schema decoders, framing/storage tests. |
| `bd893c6d` | Remove observed sort, cache finite English comparator, clarify documentation and test distinct ordering contracts; measured S1. |

There is **no public API, option, dependency, lockfile, timeout, scheduling or
ownership change**. The package entrypoint does not export diagnostics or the
framer. The baseline clarification removes incidental ordering, not a promised
contract: Plus's `InventoryEvent.baseline` specifies membership/metadata/epoch,
the FFF controller forwards those entries unchanged, and native `from_candidates`
sorts them itself. Finite `enumerate`/`glob` still deduplicates and sorts with the
same default English collation, now via one `Intl.Collator("en").compare`.

## Implementation and boundedness

`Framing.write` searches only the newly supplied chunk, advancing its byte offset
past each delimiter. An incomplete frame holds substantial proportional backing
segments plus at most one partially filled **16 KiB page**. Small fragments copy
into pages, never into a rebuilt prefix. A retained direct segment is at least
16 KiB and its backing store is at most twice its logical length. A tiny leftover
from a huge read therefore copies into a page instead of pinning that read.

At a delimiter, a split frame has **one contiguous assembly allocation**; an
already contiguous frame needs none. Each byte is scanned once, copied at most
once into a page and once into final assembly: **O(bytes)** time and bounded
**O(frame limit / 16 KiB)** segment metadata, even for one-byte reads. Retained
backing storage is bounded by twice the incomplete logical frame plus one page;
the contiguous completion scratch can add one further frame temporarily. Neither
that encoded-byte account nor `maxFrameBytes` bounds the decoded JS object heap.
The already-delivered socket chunk remains stack-owned during synchronous dispatch.

The frame ceiling is per frame and excludes newline; it covers unfinished frames.
UTF-8 is decoded fatally only after framing, so split code points are valid.
Terminal close clears prefix segments/pages, pending/queued commands and listeners;
the framer stops dispatching subsequent frames from the same chunk. No work is
scheduled by this change and no active-materialization reference is retained.
`Connection.idle`, wire cancellation/deadlines and ordered pre-ack callbacks are
unchanged. S2's queue/backpressure and yielding ownership controls are **not built**.

Schema decoders are constructed once for reply/envelope/query/config/JSON; the
existing complete-array validation flow is retained. Diagnostics are opt-in,
fixed-phase aggregates plus **512 numeric samples maximum**, with no filenames
or input references. Aggregates continue if samples fill; none filled in these
measurements. Counters record bytes/rows/copy/scan and backing/segment peaks;
timers record synchronous elapsed/max slices. Yield count is zero in S1.

## Correctness before timing

| Check | Result |
| --- | --- |
| Instrumented control build/typecheck and four focused suites | Passed; 34 tests. |
| Instrumented control full private-daemon suite | **58 passed, zero failures** before control measurements. |
| S1 `bun run build` and `bun run typecheck` | Passed. |
| S1 focused suites plus `framing.test.ts` | **48 passed, zero failures** before S1 measurements. |
| S1 full private-daemon suite | **72 passed, zero failures** before S1 measurements. |
| Five focused files, `--rerun-each 10` | **480 passed, zero failures** after measurements. |

New framing keepers exercise every byte split of UTF-8/escaped-newline JSON,
independent 1/3/127/16383/16384/16385/65536-byte fragments, bounded segment counts,
exact-limit delimiter, incomplete/complete overflow, several frames per chunk,
tiny tail backing release and close during callback. They assert **scan = wire
bytes, copy <= 2 × payload, one materialization for split frames**, not wall time.
The new public ordering test gives the source deliberately non-collated mixed-case,
accented/numeric names and null metadata: observed rows retain source order and
membership, while finite results remain English-sorted/deduplicated.

Existing tests retain fatal invalid UTF-8/JSON/schema, canceled transmitted-query
late-reply ownership, warning/result-byte/malformed-row sibling isolation,
baseline-before-changes, same-session query clock, fresh-history rejection,
reset-during-query, old callback fencing, queued-change overflow and same-view
private-daemon restart. No test was weakened. The host's known finite skill-query
excluded-root defect did not appear in this library suite and was not changed.

## Measurement method and limits

Scratch: `.test-agent/source-materialization/{README.md,measure.ts,run.ts,analyze.ts}`;
all raw results are preserved in `results-control.json` and `results-s1.json` there.
The pre-existing `.test-agent/bser-bench/` scratch is untouched. Each row below is
a **fresh Bun process and private daemon**, three serial runs per scale and per
revision. The control matrix ran first, then S1; this is not interleaved A/B.
No builds/tests ran concurrently with either successful measurement matrix.

Linux x64, AMD Ryzen 7 5800X, Bun **1.4.4**, private executable
`/usr/local/bin/watchman-facebook` (stock **20260708.093114.0**, as independently
identified by the predecessor bench). Real zero-byte files use the same
`fixture/entry-NNNNNNN.ts` shape and config as that bench. Each cold initial watch
includes daemon acquisition/crawl; manual rebaseline uses the already acquired
root. No fixture proxy, host imports, Git or native FFF is involved.

The public source sequence is initial → manual rebaseline → +1,024 → +1 → +1,025.
Because the library has no native-overflow policy, **the driver explicitly asks
for rebaseline** after the +1 accumulated overflow and next +1,025 leg; it does
not claim to exercise an actual FFF controller. Every run verifies complete file,
directory and mixed membership at every milestone and gets baseline sizes
`[N+2, N+2, N+1027, N+2052]`. No replacement occurs at +1,024. All runs open/close
one source scope, complete owner/layer cleanup, stop their daemon and remove their
private fixture. No native ownership claims follow from this library-only route.

The 1 ms heartbeat runs from acquisition through source/layer cleanup. Setup,
exhaustive membership assertions and fixture deletion are excluded; tracking is
explicitly suspended/reset around assertions. Milestone elapsed times include a
5 ms final heartbeat-settling wait. Max receive is the measured synchronous socket
callback, **not the whole JS turn**: Promise-continuation lexical/sort work can
follow before a timer runs. Phase timers include GC/OS scheduling observed inside
their brackets. JSON brackets the real `JSON.parse` through the unchanged Effect
JSON schema adapter, including its small wrapper cost; no global parser patch or
duplicated fake decoder is used. Schema brackets complete row-array validation,
not merely header validation. These are engineering observations, not CI bounds.

### All runs: latency, gaps and process memory

Times are ms; RSS/VmHWM are MiB and exclude the daemon. `+1` and `+1025` include
the explicitly requested replacement acquisition. `receive` is maximum over the
whole sequence. HWM is maximum reported at all milestones and after cleanup;
RSS is after source/layer cleanup, before process exit, without a forced final GC.

| Track | N | Run | Initial | Manual | +1024 | +1 | +1025 | Whole gap | Receive max | HWM | Cleanup RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Control | 1k | 1 | 34.29 | 12.82 | 38.23 | 38.31 | 50.72 | 6.37 | 4.76 | 98.60 | 97.14 |
| Control | 1k | 2 | 33.92 | 11.92 | 36.61 | 37.73 | 52.97 | 5.72 | 4.32 | 99.30 | 98.22 |
| Control | 1k | 3 | 32.85 | 12.16 | 36.19 | 37.04 | 49.06 | 5.86 | 3.14 | 98.67 | 97.10 |
| Control | 10k | 1 | 136.26 | 43.01 | 36.79 | 67.62 | 92.71 | 31.48 | 9.90 | 116.91 | 115.56 |
| Control | 10k | 2 | 102.77 | 44.93 | 36.69 | 65.14 | 82.24 | 22.64 | 10.28 | 121.34 | 119.88 |
| Control | 10k | 3 | 102.13 | 41.93 | 36.26 | 62.49 | 80.42 | 21.21 | 9.32 | 121.51 | 120.14 |
| Control | 100k | 1 | 815.30 | 411.36 | 36.76 | 445.00 | 490.44 | 214.66 | 57.21 | 296.77 | 227.14 |
| Control | 100k | 2 | 818.66 | 387.64 | 37.10 | 431.58 | 457.88 | 204.67 | 62.71 | 300.81 | 213.25 |
| Control | 100k | 3 | 909.37 | 412.41 | 35.88 | 447.29 | 461.16 | 220.77 | 58.70 | 294.60 | 217.85 |
| S1 | 1k | 1 | 37.23 | 11.56 | 36.11 | 35.76 | 49.12 | 8.78 | 3.38 | 98.21 | 96.65 |
| S1 | 1k | 2 | 33.21 | 12.78 | 47.80 | 34.71 | 46.48 | 6.39 | 3.85 | 97.27 | 95.85 |
| S1 | 1k | 3 | 32.88 | 10.69 | 35.79 | 35.07 | 47.15 | 6.06 | 3.10 | 97.57 | 96.36 |
| S1 | 10k | 1 | 94.03 | 36.66 | 35.21 | 56.82 | 71.43 | 14.45 | 9.53 | 119.51 | 118.07 |
| S1 | 10k | 2 | 95.47 | 34.67 | 35.82 | 58.56 | 71.65 | 13.91 | 9.07 | 115.15 | 113.48 |
| S1 | 10k | 3 | 95.50 | 35.05 | 37.27 | 60.78 | 71.19 | 14.37 | 8.90 | 116.20 | 114.96 |
| S1 | 100k | 1 | 735.62 | 280.14 | 37.20 | 314.61 | 324.38 | 88.41 | 63.22 | 312.51 | 311.38 |
| S1 | 100k | 2 | 714.56 | 276.05 | 35.99 | 360.90 | 331.48 | 127.41 | 97.59 | 312.46 | 269.24 |
| S1 | 100k | 3 | 708.65 | 279.49 | 35.69 | 319.09 | 341.92 | 100.76 | 65.81 | 312.85 | 311.57 |

There is **no measured memory-win claim**: 100k S1 HWM is higher here, despite
far fewer copied bytes. Whole-process residency includes live decoded graphs,
assertion maps and GC/allocator behavior, not merely encoded buffers; cleanup
does not imply RSS returns to startup. These results do not bound 64 hot roots,
1M rows, 32/64 MiB envelopes or Windows/macOS behavior.

### Initial acquisition phase attribution — all runs

Elapsed phase totals in ms, including small setup/ack frames on that same route.
Envelope validation is separately recorded in raw data (initial totals
0.23–0.39 ms); the table focuses on materialization. Scan and copy are disjoint;
receive includes them plus UTF-8/JSON/schema and is not additive with this table.

| Track | N | Run | Scan | Copy | UTF-8 | JSON | Row schema | Lexical | Observed sort |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Control | 1k | 1 | 0.02 | 0.09 | 0.08 | 1.40 | 2.49 | 1.04 | 0.90 |
| Control | 1k | 2 | 0.02 | 0.08 | 0.07 | 1.12 | 3.03 | 0.98 | 0.91 |
| Control | 1k | 3 | 0.02 | 0.08 | 0.08 | 1.07 | 2.75 | 0.83 | 0.97 |
| Control | 10k | 1 | 0.08 | 0.49 | 0.32 | 3.28 | 7.66 | 3.29 | 8.49 |
| Control | 10k | 2 | 0.07 | 0.55 | 0.36 | 3.29 | 7.86 | 3.59 | 7.46 |
| Control | 10k | 3 | 0.08 | 0.43 | 0.31 | 2.89 | 7.24 | 3.07 | 7.58 |
| Control | 100k | 1 | 3.81 | 25.05 | 3.15 | 18.00 | 29.37 | 21.43 | 104.69 |
| Control | 100k | 2 | 3.85 | 31.93 | 6.42 | 16.36 | 29.80 | 24.05 | 99.18 |
| Control | 100k | 3 | 3.65 | 30.21 | 0.90 | 16.91 | 36.26 | 21.65 | 119.85 |
| S1 | 1k | 1 | 0.06 | 0 | 0.06 | 1.00 | 2.60 | 0.79 | 0 |
| S1 | 1k | 2 | 0.05 | 0 | 0.05 | 0.84 | 2.60 | 0.91 | 0 |
| S1 | 1k | 3 | 0.05 | 0 | 0.05 | 1.01 | 2.99 | 0.96 | 0 |
| S1 | 10k | 1 | 0.10 | 0.33 | 0.45 | 2.53 | 7.28 | 3.67 | 0 |
| S1 | 10k | 2 | 0.11 | 0.35 | 0.36 | 2.93 | 6.57 | 3.40 | 0 |
| S1 | 10k | 3 | 0.10 | 0.22 | 0.26 | 2.73 | 7.08 | 3.14 | 0 |
| S1 | 100k | 1 | 0.42 | 2.86 | 4.19 | 16.19 | 37.88 | 23.20 | 0 |
| S1 | 100k | 2 | 0.35 | 3.34 | 3.50 | 14.83 | 34.97 | 20.24 | 0 |
| S1 | 100k | 3 | 0.39 | 2.62 | 3.94 | 16.32 | 34.75 | 22.23 | 0 |

Caching does not eliminate the cost of validating/copying 100k rows. This sample
does not establish a schema speedup: its cost and GC variation remain material.

### Maximum individual synchronous phase slice at 100k

Maxima span initial/manual/churn, not just the fastest initial sample (ms).

| Track | Run | Scan | Copy | UTF-8 | JSON | Row schema | Lexical | Sort | Whole gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Control | 1 | 0.44 | 3.56 | 3.10 | 16.95 | 37.98 | 30.70 | 124.54 | 214.66 |
| Control | 2 | 0.48 | 4.20 | 6.38 | 18.23 | 41.58 | 30.76 | 112.09 | 204.67 |
| Control | 3 | 0.59 | 4.18 | 3.92 | 15.89 | 37.46 | 23.97 | 136.41 | 220.77 |
| S1 | 1 | 0.08 | 3.47 | 4.13 | 16.95 | 39.31 | 24.72 | 0 | 88.41 |
| S1 | 2 | 0.05 | 3.49 | 4.69 | 27.49 | **61.75** | 28.14 | 0 | **127.41** |
| S1 | 3 | 0.04 | 3.02 | 3.91 | 17.68 | 42.63 | 34.07 | 0 | 100.76 |

The JSON 27.49 ms/schema 61.75 ms observation is retained, not discarded. Even
ordinary initial receive callback plus lexical continuation totals roughly 76–84 ms before
timer dispatch. No yield occurs inside these phases. Heartbeats progress during
socket/daemon waits (1,233–1,252 ticks per S1 100k run), but not during the large
synchronous materialization itself.

### Copy complexity and encoded backlog

The 100k initial query payload is **8,100,381 bytes**; counters here cover the
whole initial route, including 317 bytes of small replies/delimiters. The complete
sequence receives **32,870,202 bytes / 20 frames** in every 100k process.

| Track | Run | Initial copied bytes | Initial scanned bytes | Full-sequence copied bytes | Full-sequence scanned bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Control | 1 | 102,202,586 | 102,202,586 | 387,597,754 | 387,597,754 |
| Control | 2 | 103,006,554 | 103,006,554 | 383,915,066 | 383,915,066 |
| Control | 3 | 94,350,938 | 94,350,938 | 380,014,586 | 380,014,586 |
| S1 | 1 | 8,100,381 | 8,100,698 | 32,650,601 | 32,870,202 |
| S1 | 2 | 8,100,381 | 8,100,698 | 32,650,601 | 32,870,202 |
| S1 | 3 | 8,100,381 | 8,100,698 | 32,650,601 | 32,870,202 |

Thus initial copy amplification falls from **11.65–12.72× to 1×**. Across the
sequence it is slightly below 1× because already-contiguous small frames need
no assembly copy. At 10k all initial S1 runs copy 810,380 bytes and scan 810,697;
at 1k all initial S1 runs copy zero and scan 81,696. Deterministic adversarial
tests prove the independent <=2× upper bound when small-fragment coalescing is
needed; the real socket distribution happens to need only the final copy.

There is no async encoded queue in S1. The measured peak retained/active encoded
account over each sequence is 247,430–247,431 bytes at 1k, 976,432 at 10k and
**8,266,433 at 100k**. S1 peak retained segment counts are respectively **0–2,
3, and 24** (all 100k runs). Completion scratch is separately up to one full
frame and is not added to this encoded backlog metric. The control counter's
single prefix is one segment, not evidence of a lower copy cost.

## Parent checkpoint and next decision

**Recommend S2's ordered cooperative row-schema and lexical materialization,
subject to the parent's ownership review.** The measured residual, including a
61.75 ms schema slice and 88–127 ms whole gaps, is enough evidence; a new queue is
not being added merely to match a diagram. Preserve complete publication,
cancellation/wire-owner deadlines, same-frame pre-ack ordering, epoch fences and
bounded encoded backlog when introducing yields. G should review the linearity
and backing-storage tests, unchanged failure scopes and baseline-order contract
before any host carry.

UTF-8 and JSON remain indivisible synchronous operations; their observed maxima
are **4.69 ms and 27.49 ms** after S1. This does not justify a worker/parser/BSER
rewrite at 100k. The separate wire bench's **154–160 ms daemon first-byte latency**
remains external daemon/query latency, not something S1 changes. Crucially,
waiting on another process's socket **does not itself block this process's event
loop**: it must not be subtracted from the old 200 ms heartbeat gap or described
as its cause. TTFB and event-loop stalls are different measurements.

No host/VCS target is cleared here. No S2 scheduling, BSER, Git/FFF source,
artifact carry, publication, push, installed service or daemon binary change was
made. The receipt is a builder checkpoint, not acceptance or independent review.

## Cross-references and reproduction

- [Observed source Gate A](observed-source0.sol61x.md) owns source semantics and
  predecessor verification; this receipt narrows performance and ordering only.
- [Maintained overview](../../README.md#observed-inventory) distinguishes unsorted
  observed membership from [finite sorted output](../../ENUMERATION.md#matching-and-selection).
- [Source-materialization handoff](file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-materialization-handoff0.gpt6a.md#s1--attribution-and-linear-framing)
  owns the S1/S2 decision boundary; no proposed S2 controls were exposed early.

From the library checkout, reproduce with `bun
.test-agent/source-materialization/run.ts TAG REV` on the desired committed
revision (the control needs `97c5e2ae`, not the optimized decoder/framer), then
`bun .test-agent/source-materialization/analyze.ts control s1`. The preserved raw
JSON includes cumulative phase totals/maxima and bounded per-call timestamps at
every milestone, not just the tables selected above.
