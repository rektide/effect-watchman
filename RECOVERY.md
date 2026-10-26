---
type: APIReference
title: Optional Watchman recovery signals
description: Checked filesystem capability, attachment/reset ordering, shared owner health, recovery limits and consumer obligations.
resource: /RECOVERY.md
status: implemented
author: GPT-6.1 Sol medium
date: 2026-10-26
sources:
  - resource: "opencode://ses_e87038c1affeHRNE9v4Ggec0Sl"
    title: Implement scoped owner recovery, additive checked signals, deterministic fault peers and private-daemon verification
  - resource: "opencode://ses_e870ad63fffepjINA5vdd58LWO"
    title: Parent selects the additive typed signal capability and preserves ordinary watch failure semantics
  - resource: /design/watch/additive-gate.md
    title: Additive composition gate and prohibition on fabricated ordinary root updates
  - resource: /src/Recovery.ts
    title: Public checked capability and signal types
  - resource: /src/Owner.ts
    title: Shared controller, backoff, health and generation ownership
  - resource: /src/SignalBackend.ts
    title: Acknowledged attachment boundary and bounded delivery
  - resource: /test/recovery.test.ts
    title: Deterministic fault-peer and virtual-clock regression cases
---

# Optional recovery signals

`Recovery.fileSystem` checks the filesystem object already provided by
`Watchman.layer`, `Watchman.layerWithGlob`, or `Watchman.fromBackend` with a
Watchman backend. It returns `{ watch, health }`, not a new service or owner.
The structural marker is `~effect-watchman/recovery/v1`.
Unenhanced/native-only filesystems fail this check rather than silently omitting
resets. Existing injected backends without this capability remain usable for
ordinary `Watchman.make`/`fromBackend` watching.

```ts
import { Effect, Stream } from "effect"
import { Recovery } from "effect-watchman"

const consume = Effect.gen(function*() {
  const recovery = yield* Recovery.fileSystem
  yield* recovery.watch("/approved/project", { recursive: true }).pipe(
    Stream.runForEach((signal) => signal._tag === "Reset"
      ? authoritativeRescan(signal.generation, signal.sequence)
      : applyHint(signal.event))
  )
})
```

`authoritativeRescan` and `applyHint` above are application effects, not library
functions. Provide the same filesystem layer as ordinary consumers. Watching
does not itself enumerate files or retry application scans.

## Signal contract

- `Reset`: `{ _tag: "Reset", reason, generation, sequence }`. Reasons are
  `initial`, `transport`, or `history`. Sequence is monotonically increasing
  **per consumed signal stream**, while generation identifies the owner's
  connection. History loss can increase sequence without changing generation.
- `Event`: `{ _tag: "Event", event }`, containing an ordinary absolute-path
  filesystem hint. Selection, ignores, cookie policy and file replacement
  options match the enhanced ordinary watch route.

The initial reset is mandatory too: scan **after consuming it**, not before
subscription attachment. The backend obtains a clock, installs its listener and
subscribes from that clock. It waits for the subscription acknowledgement, then
delivers the reset before any buffered file hints—even when acknowledgement and
file frames share a socket read. A failed/incomplete attachment emits no readiness.
Ignore rules never suppress a reset, including an empty fresh-history frame.

After transport failure the stream retains its desired interest, reattaches to
the replacement connection and emits a new reset before later hints. It does not
claim continuity across that interval. Fresh history on a live subscription emits
a local history reset before that frame's rows without replacing the connection.
If fresh history accompanies initial attachment, one history reset covers both
boundaries. Subsequent history losses remain separate reset sequences.

Delivery is bounded by `maxBufferedEvents` (default 1024); attachment staging is
also bounded. Overflow is a visible terminal stream error, never silent dropping
of a reset. Root rejection, daemon subscription cancellation, escaping paths and
local protocol errors also fail the affected stream visibly. Closing it removes
its desired interest, removes delivery and issues bounded unsubscribe cleanup.
Named daemon root watches remain daemon-owned; no root unwatch/prune is added.

Applications must preserve dirty state after failed rescans, pace retries, and
retain subsequent signals while a scan runs. Another reset during a scan is new
dirty work. Owner health does **not** certify completion of application rescans.

## Shared lifecycle and health

Every scoped owner has one reconnect/restore/probe controller, whether projected
through watch-only, glob-only or combined layers. Reading `recovery.health` is
passive: `{ state, generation, interests, attempts, reason }`. State is `healthy`,
`recovering` or `closed`; `interests` counts retained opt-in signal streams, not
ordinary watches or daemon roots. Root-local rejection/cancellation does not
replace healthy siblings or start an owner reconnect loop.

Layer construction makes one bounded connection attempt. A missing daemon leaves
a degraded owner rather than failing the layer: ordinary watch/query operations
fail visibly, whereas signal streams wait for recovery. Invalid options and root
approval validation still fail construction. Queries are never silently retried
as successful empty inventories. A query binds root acquisition, query and config
commands to one generation; later queries can use the replacement generation.

Defaults and optional positive-integer limits:

| Option | Default | Meaning |
| --- | --- | --- |
| `retryMinMs` | 250 | Initial exponential delay ceiling |
| `retryMaxMs` | 60000 | Sustained-outage delay ceiling |
| `stableHealthMs` | 30000 | Healthy interval before attempt count resets |
| `probeIntervalMs` | 30000 | Idle liveness probe interval |
| `probeTimeoutMs` | request timeout, normally 3000 | Probe on-wire deadline |

Each retry waits uniform equal jitter in the upper half of its capped exponential
ceiling. Brief connects do not reset attempt growth. Restorations are serial,
bounding reconnect command pressure independently of the number of consumers.
There is one WARN per outage transition, one INFO recovery summary and DEBUG
attempt detail. No per-interest retry/log storm, daemon autospawn or native fallback.

An idle connection is tested with `version`. A busy serialized wire already has
its command deadline, so a short probe is not queued behind a legitimate long
query. Connect/request/cleanup/frame/queue limits retain their existing roles.
Cleanup queue waits honor the configured queue budget (combined enumeration
defaults to 65 seconds), then use their separate cleanup on-wire deadline. Owner
scope closure cancels its controller/backoff and destroys its current/candidate
socket. Consumer cleanup remains bounded by the configured wire/queue budgets.

## Ordinary watch remains ordinary

`fs.watch` and standalone Effect `WatchBackend.register` emit only ordinary hints
and still fail on connection or history loss. They are **not** transparently
reopened. The owner can recover underneath them; an explicitly new watch can use
the healthy replacement, after application reconciliation. No fake root Update
encodes readiness. `Recovery.fileSystem` is the opt-in correctness-bearing route.

## Verification boundary

`test/recovery.test.ts` covers absent startup, acknowledged initial ordering,
same-generation history reset, root rejection/cancellation isolation, 40-interest
serial restoration, ordinary failure, outage query failure and later shared-query
success, idle wedges and accepted-but-silent sockets, exponential cap/stable reset,
loss during restoration, late attachment cancellation and visible overflow.
Backoff/probe scheduling uses TestClock and seeded randomness; real socket command
deadlines use short bounded configured limits. The owned stock-daemon suite checks
the new capability alongside the existing ordinary/injected-backend routes.

These library checks do not establish OpenCode rescan recovery. ⇄
[OpenCode's consumer account](/doc/consumer/opencode.md) tracks the separate host
integration and last-good/retry obligations.
