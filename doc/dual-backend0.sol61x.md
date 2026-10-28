---
type: ImplementationReceipt
title: Selectable JSON and BSER Watchman wire backends
description: JSON-default dual wire backends, the human-approved interface ledger and permanent lossy-BSER policy, published JSON client with log parity, and dual-backend correctness and real-daemon evidence.
resource: /doc/dual-backend0.sol61x.md
status: human-approved ledger and permanent BSER degradation; published JSON client and verified log parity; effect-watchman main publication authorized
author: GPT-6.1 Sol
model: openai/gpt-6.1-sol#xhigh
date: 2026-10-28
sources:
  - resource: "opencode://ses_e7c90f1d6ffeviS28mp5Msdsk1"
    title: Build and verify dual backends, then record human approval of all nine ledger items and permanent BSER degradation; fix/publish the JSON client, adopt its GitHub revision, verify parity, and carry the authorized effect-watchman main publication
  - resource: "file:///home/rektide/src/watchman-client-json/README.md"
    title: Extracted public wire seam, cleanup boundary, cancellation ownership and failure scopes
  - resource: "file:///home/rektide/src/watchman-client-json/doc/extraction0.sol61x.md"
    title: Extraction decisions, S1 lineage and prior transport/framing evidence
  - resource: "file:///home/rektide/src/watchman-client-json/src/Connection.ts"
    title: JSON client consumed unchanged; source of the BSER peer's FIFO and terminal lifecycle; inspected missing log discriminator
  - resource: "file:///home/rektide/src/bser-esm/README.md"
    title: GitHub distribution, plain ESM packaging and exact int64 semantics
  - resource: "file:///home/rektide/src/bser-esm/index.js"
    title: Actual dumpToBuffer/loadFromBuffer APIs, native-endian lengths, template/SKIP decoding, lossy string boundary and exact-consumption check
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-materialization-handoff0.gpt6a.md"
    title: Retained contracts in section 3 and wire/materialization ownership in sections 4.3–4.4
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/bser-rebuild0.gpt6a.md"
    title: Protocol facts and the real strict-codec fork/patch obligations in section 4.2; not authorization for its separate clean-slate API
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/bser-bench0.sol61x.md"
    title: Actual wire-size ratio and live-daemon v1 interoperability evidence
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/bser-bench1.sol61x.md"
    title: bser-esm exact BigInt and lossy UTF-8 characterization, template behavior and 1.8x decode tradeoff
  - resource: /src/Connection.ts
    title: Construction-time wire seam and shared schema/delivery exports
  - resource: /src/BserConnection.ts
    title: BSER FIFO ownership, isolated PDU decoding, classification and failure scopes
  - resource: /src/BserFraming.ts
    title: Bounded v1 header and per-PDU encoded-payload budget
  - resource: /src/Owner.ts
    title: Existing recovery/session/root ownership retained above selection
  - resource: /test/transport.test.ts
    title: Both wire paths through public filesystem cleanup, cancellation and loss cases
  - resource: /test/query-transport.test.ts
    title: Shared-owner cancellation and operation-local query errors on both paths
  - resource: /test/wire-contract.test.ts
    title: Direct seam regressions, explicit policy skips, template/SKIP and unsafe-int64 keepers
  - resource: /test/bser-framing.test.ts
    title: Every byte split, integer widths, byte-exact limits, invalid headers and release bounds
  - resource: /test/observed.test.ts
    title: Both protocols directly against the real daemon, including template-bearing replies
  - resource: /test/inventory-daemon.test.ts
    title: Both public inventory routes with pre-ack staging, delete/recreate and retained restart; membership-readiness race correction
  - resource: /README.md
    title: Consumer-facing wire choice and limitations
  - resource: /ENUMERATION.md
    title: Representation-dependent budgets and unchanged query/finite-result semantics
  - resource: "https://github.com/rektide/effect-watchman/commit/17af68f3f0eef5136901f25c07349fccefb99df7"
    title: Independently published Stats type-band fix found on main before delivery; inspected and preserved without rewriting it
verification:
  method: Bun 1.4.4 scripted dual-wire peers, deterministic BSER framing splits, ten focused repetitions, private stock-daemon suites and repeated retained-view restart, tsgo build/typecheck and consumer-only source typecheck
  scope: Linux x64, explicit private /usr/local/bin/watchman-facebook instances and GitHub source publication; no independent review, hostile-codec audit, integration performance measurement, npm release or host dependency refresh
---

# Dual-backend receipt

## 2026-10-28 human sign-off and publication addendum

**The human approved all nine ledger items as implemented.** BSER's lossy UTF-8
degradation is **accepted**, with its fatal-text skip a permanent documented
marker; no codec fork. JSON remains default. Publication of the JSON client,
replacement of its local dependency link, the JSON log-routing correction and
the fast-forward push of effect-watchman's `main` were explicitly authorized.
The original checkpoint/ledger below is preserved as history; its pending-policy,
unpublished-dependency and open-log-gap statements are superseded here.

- Published public repository: [rektide/watchman-client-json](https://github.com/rektide/watchman-client-json).
  `main` was pushed and independently read back as
  **`e88f258ba142b8de18d931b930818678507dad49`** (`fix(wire): ignore unilateral
  logs without consuming command replies`). Authentication was checked as
  `rektide`, SSH; the repository did not exist before creation. Its description
  and topics identify the raw-TypeScript, no-build family. No npm publication
  or version bump; client remains **0.1.0**.
- JSON now recognizes optional string `Envelope.log` and ignores logs after
  cancellation/named-subscription routing and before the normal-reply slot.
  There is no retained log queue/user logger. Malformed metadata remains terminal.
  BSER uses that same Envelope schema; the JSON-only log-parity skip is removed.
  The client keeper proves logs before, between and after replies do not settle
  commands, including an empty log string and an idle connection.
- Effect-watchman code/dependency checkpoint:
  **`8f01070c269ccca706fad7272aa9f8eaa2cb59ac`** (`fix(wire): match JSON log
  routing via published client`). The dependency is now
  `github:rektide/watchman-client-json#main`; `bun install` resolves the published
  **`e88f258`** head, with its archive identity/integrity in `bun.lock`. The lock
  diff changes only that dependency declaration and its resolved package record;
  local-client dev-dependency metadata disappears, its exact Effect peer remains.
  Installed `Connection.ts` matches the published source checksum.
- Effect-watchman's final publication target is an **append-only merge** of this
  addendum's branch and existing main **`17af68f3f0eef5136901f25c07349fccefb99df7`**,
  pushed to
  [effect-watchman/main](https://github.com/rektide/effect-watchman/tree/main).
  That independent `fix(watchman): keep Stats literal compilable across type
  bands` commit arrived while this continuation was running and touches only
  `src/GlobView.ts`, outside the wire changes. Its content and identity are
  preserved; neither history is rebased or rewritten.
  Its exact pushed head is recorded by the native session's `git ls-remote`
  verification and final delivery report, avoiding a self-referential commit hash
  inside this document. The push is a fast-forward of the existing local stack;
  no squash/edit, force-push, tag or version bump (**1.0.0** stays).

Post-rewire verification: client **41 pass, 0 fail** (731 assertions), its new log
keeper repeated ten times **10 pass, 0 fail** (110 assertions); effect-watchman
build/typecheck clean, full non-daemon run **98 pass, 16 skip, 0 fail** (1,647
assertions), daemon suite **19 pass, 0 fail** (186 assertions), and the integration
log-parity keeper on both wires repeated ten times **20 pass, 0 fail**. The 16
non-daemon skips are 15 daemon opt-in cases plus the one permanent BSER UTF-8
marker. The full daemon-enabled run is **113 pass, 1 skip, 0 fail**, 1,818
assertions; its sole skip is that permanent marker. Receipt and README passed
rkt checks again.

**Host adoption remains outstanding:** OpenCode's lock still pins the older
effect-watchman commit until a separate deliberate refresh. No host repository,
bser-esm or effect-watch-plus file was changed by this continuation.

## Original local checkpoint — outcome and scope

JSON remains the default, now by consuming `watchman-client-json` rather than
maintaining another local copy of its connection/framer. `wireFormat: "bser"`
selects a peer connection beneath the existing filesystem APIs. No inventory,
epoch, glob selection, root policy, recovery scheduling or public event shape was
redesigned. The separate clean-slate proposal was not implemented.

Started clean at **`4c1e834a`**, the existing `main` bookmark. Commits:

- **`728a7539`** — `feat(watchman): add selectable JSON and BSER wire backends`.
- **`9debdd7a`** — `test(watchman): await recreated daemon membership before asserting`.
- The following documentation checkpoint contains this receipt and public guidance.

**No push, publication or bookmark move. `main` remains at `4c1e834a`.** No files
in watchman-client-json, bser-esm, effect-watch-plus or OpenCode were changed.
The local JSON dependency deliberately prevents claiming an externally installable
release. Interface choices below are implemented proposals, not human acceptance.

## Original interface-break and adoption ledger — approved 2026-10-28

1. **New construction option:** `wireFormat?: "json" | "bser"` on Watchman/Glob socket-configured layers; omitted means JSON. Fixed across recovery; invalid values fail construction. No negotiation/fallback.
2. **Wire-byte budgets:** `maxFrameBytes`/`maxQueryBytes` count each selected encoding's payload, excluding JSON LF or BSER's 4–11-byte v1 header. The same numeric budget admits different decoded content. Equality remains legal.
3. **BSER text/codec degradation:** opt-in BSER silently replaces invalid UTF-8 with U+FFFD. Fatal-text parity is explicitly not met. The unpatched codec also lacks the proposed nested-count/depth/expansion hardening; encoded limits do not certify decoded-heap bounds.
4. **BSER numeric metadata:** out-of-safe-range int64 remains exact bigint in the codec and fails the existing number-only filesystem schema (query-local; subscription-terminal), rather than rounding it into a number.
5. **New runtime dependencies:** `watchman-client-json@0.1.0` via unpublished `file:../watchman-client-json`, and `@superbfowle/bser-esm@3.0.0` via `github:rektide/bser-esm` (Bun lock `15d3ff8`). Publish the JSON repository and replace its local link before external adoption; publishing/pushing needs human direction. bser-esm declares Node >=20.19; Effect 4.0.1 remains the exact peer.
6. **Export/source changes:** package-root exports and public capability markers are unchanged. Unsupported direct source consumers lose `src/Connection.ts`'s old concrete class and removed `src/Framing.ts`; the private seam is now `makeConnection`/`WireConnection`. JSON wire diagnostics/framing tests move with their owning dependency; local attribution no longer captures that client's private wire phases. Raw `.ts` imports and a referenced private codec declaration require TypeScript-capable consumption as before; the repository enables `allowImportingTsExtensions`.
7. **Known non-identical log behavior:** BSER ignores unilateral logs without consuming a reply slot; unchanged JSON can fail on them. Full classifier parity remains incomplete pending an authorized upstream JSON-client fix. Filesystem APIs do not request log delivery.
8. **Packaging/release:** raw-source entrypoints stay unchanged; the new receipt is included in the package file list. Version remains 1.0.0 at this local checkpoint; no release/version-policy decision is finalized.
9. **Diagnostic wording:** extracted-client closure reports `Watchman connection scope closed`, replacing the private connection's `Watchman scope closed`. Typed filesystem error categories and failure scopes do not change.

## Wire ownership and bounded framing

The seam is a structural projection of the extracted client's public methods,
not a new public low-level client API. Both paths use the same Reply/Envelope/
QueryReply/ConfigReply schemas and `SubscriptionCanceled` class. Bounded Delivery
is reused from the JSON package. Cleanup deadlines and event capacity stay in the
owner/backends; local registration/detachment does not send commands.

BSER retains the extracted FIFO lifecycle: an unsent abort removes only that
request; a transmitted abort rejects its caller but retains the reply slot and
original deadline. Only consuming its late reply permits the next command to
transmit. Queue/wire timeouts, queue overflow, broken correlation, framing,
codec/envelope and subscription-schema corruption are connection-terminal.
Framed query budget/schema/warning errors and daemon command errors are local to
the operation. Full schema validation precedes listener delivery or query success.
Unknown named subscriptions still validate before being ignored.

BSER classification is cancellation → named subscription/state/error/data → logs
→ ordinary reply. Named cancellation removes/fails only that listener, even when
the accompanying unused data payload is malformed. State envelopes retain the
existing schema projection; no new public state-event API is introduced.
JSON preserves its extracted behavior, including the missing log case documented
below. Both paths preserve frame and row order. Caller-owned pre-subscribe
registration and baseline-before-staged-changes policy remain above this seam.

`BserFraming` accepts v1 `00 01` plus tagged signed native-endian int8/16/32/64
lengths. Header scratch is fixed at **11 bytes**. Negative/zero, over-budget and
unsafe huge lengths fail before allocating a PDU. One bounded `header + payload`
buffer is allocated after a validated declaration, filled without prefix rebuilding,
and handed to `loadFromBuffer` in isolation. Multiple PDUs per chunk are normal;
terminal callbacks prevent later same-chunk publication. Close releases the
incomplete PDU. This is **encoded-input boundedness**, not strict validation of
nested lengths/template expansion. The codec makes its own accumulator copy.

There is no async decode/yield/backpressure redesign, no S2 responsiveness claim,
no v2 support and no reuse of the library's old JSON framer outside its new owner.
The dependency's S1 framer/tests remain the JSON algorithm authority; integration
tests exercise the actually consumed package rather than a retained local copy.

## Strict UTF-8 decision — alternatives, not a hidden policy choice

| Choice | Implementation and benefit | Cost / limitation |
| --- | --- | --- |
| **(a) Documented degradation — implemented for opt-in BSER** | Use unmodified bser-esm; zero new UTF-8 validation code. README typed-option warning, an explicit skipped fatal-text keeper and a positive lossy-decoding characterization test. | Invalid filenames/keys can alias after replacement. Schema validation and re-encoding cannot recover the original bytes. Not the old fatal-text contract. |
| **(b) Strictness fork/patch** | Fatal validation at every string/key/template-key boundary, bounds checks and controlled decoding, distributed as an actual reviewed codec fork. | We own maintenance, license/patch provenance, publishing, upgrade review, compatibility corpus and renewed performance measurements. A library-local package-manager patch does not reliably reach consumers. |

Recommendation: **keep JSON default; treat (a) as an explicitly degraded opt-in
only if the human accepts it.** If BSER must meet the existing string-correctness
contract, select (b) deliberately. No unmodified-codec adapter can honestly promise
that parity after loss has occurred. Do not reject literal U+FFFD as a substitute.

A real (b) patch should follow the rebuild's section 4.2: preserve valid U+FEFF
and U+FFFD without normalization; validate nested nonnegative safe lengths/counts,
depth and expanded-item budgets; handle template SKIP/absent/null correctly;
enforce exact consumption and safe object keys/duplicate policy. The outer framer
here neither implements nor audits those codec rules.

## Classifier gap found at the extraction boundary

The JSON package's Envelope schema omits `log`, and `Connection.receive` routes
any non-subscription frame to the pending reply. A log therefore becomes a
mismatched acknowledgement, or an unsolicited-response failure when idle. There
is no supported pre-dispatch codec hook to fix this from the integration seam.
Monkeypatching its socket/private receive method or duplicating the JSON client
would defeat the commissioned extraction. The assignment expressly prohibited
dependency edits, so none were made.

The BSER log keeper passes; the JSON parity keeper is explicitly skipped and
named as an upstream follow-up. This is a real remaining requirement, not policy
approval or a claim of identical classifiers. An authorized JSON-client revision
should add the discriminator and its own tests, then enable the integration keeper.

## Verification evidence

Environment: Linux x64, Bun **1.4.4**, private foreground
`/usr/local/bin/watchman-facebook`. Tests use `/tmp/opencode` fixtures and never
connect to an ambient daemon. Commands run from the library repository.

| Check | Result |
| --- | --- |
| `bun run build` and `bun run typecheck` | Clean; both are tsgo no-emit checks. |
| `WATCH_TEST_DIRECTORY=/tmp/opencode bun run test` without daemon opt-in | **97 pass, 17 skip, 0 fail**, 1,646 assertions; 15 daemon skips plus two explicit policy/parity markers. |
| Dual transport/query/wire-contract/BSER-framing suites, `--rerun-each 10` | **620 pass, 20 skip, 0 fail**, 14,120 assertions. |
| `WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook WATCH_TEST_DIRECTORY=/tmp/opencode bun run test:daemon` | **19 pass, 0 fail**, 186 assertions. Default JSON suites retained; direct observed pairing/delete-recreate/history tests and public retained-inventory restart also run on BSER. |
| Full `bun run test` with the same daemon opt-in, after the readiness correction | **112 pass, 2 skip, 0 fail**, 1,817 assertions across 14 files. Only the two explicitly declared policy/parity keepers skip. |
| Public inventory daemon suite, `--rerun-each 10`, after readiness correction | **20 pass, 0 fail**, 200 assertions. |
| Consumer-only tsgo project including only a public-API source import | Clean; private bser-esm declarations are reachable through an explicit source reference, not only the repository include glob. |
| `pnpm pack --pack-destination .test-agent/dual-backend` | Raw entrypoint, source/declaration files and receipt included; no dist, tests or node_modules. Local `file:` dependency is still a release blocker. |
| `rkt check --okf` on README, enumeration guide, this receipt and S1 ownership addendum | Passed structure, link/anchor, source and native-session provenance checks. |

Focused coverage includes every byte split and signed header width, exact encoded
limits, oversized declared unfinished frames, invalid/v2 magic and tags, bounded
partial-PDU release, split UTF-8/multi-PDU chunks, queue/abandoned wire ownership,
sibling isolation, cleanup silence, envelope precedence, unsolicited/mismatched
terminal fanout, complete last-row validation, template SKIP/null/order, and
unsafe int64 rejection. Codec-specific malformed UTF-8 is intentionally different.
Direct BSER daemon tests consume actual template-bearing replies without the
inventory proxy's decode/re-encode normalization.

One repeated run initially produced **19 pass, 1 fail**: default JSON asserted
the settled recreated `a.ts` after only the first catch-up frame. The daemon can
deliver removal and recreation separately. The correction waits for the exact
asserted membership (and removal of `victim.ts`) before comparing it, rather than
sleeping or changing production semantics. The repeated corrected suite is green.
The previously reported excluded-root failure did **not** reproduce; no excluded-
root workaround or unrelated policy change was added.

## Measured tradeoff and documentation connections

The benchmark receipts measure **31.1 ms BSER vs 17.2 ms JSON** steady decode at
100k, roughly **1.8× slower**, with **4,200,349 B vs 8,100,385 B** wire frames.
That is **~52% of JSON's size / ~48% fewer bytes**, not “52% fewer.” It is a
captured-decoder observation, not a new integration/host measurement. Neither a
smaller wire frame nor this adoption clears the S1 long-task residual.

[README wire choice](/README.md#wire-backend-choice) is the consumer home;
[enumeration budgets](/ENUMERATION.md#baseline-guarantees-and-budgets) explains
the representation-dependent limit. [Recovery](/RECOVERY.md) and the
[S1 checkpoint](/doc/inventory/source-materialization-s1.sol61x.md) retain their
separate ownership/performance evidence. This receipt links their boundary to the
new dependency owner instead of treating a transport switch as epoch/recovery work.
