---
type: VerificationReport
title: Enumeration implementation and conformance receipt
description: Exact library revisions, private daemon and real Node evidence, resource/cancellation checks, and remaining limits.
resource: /design/watch/enumeration-verification0.sol61x.md
status: verified within stated scope
author: GPT-6.1 Sol xhigh
date: 2026-10-19
sources:
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Built both libraries, corrected npm and Unicode traversal boundaries, and ran independent daemon/Node/rg verification
  - resource: /src/Enumeration.ts
    title: Final structural consumer contract
  - resource: /src/GlobBackend.ts
    title: Daemon candidate planning, explicit local coverage and checkpoint classification
  - resource: /src/GlobView.ts
    title: Actual npm traversal over the daemon-backed directory view
  - resource: /src/Connection.ts
    title: Command-specific decoding, query budgets and retained cancellation ownership
  - resource: /test/enumeration.test.ts
    title: Private daemon npm-oracle, coverage, symlink, permission and large-baseline checks
  - resource: /test/query-transport.test.ts
    title: Shared-owner, cancellation, schema, warning, budget and deadline checks
  - resource: "file:///home/rektide/src/effect-watch-plus/test/enumeration.test.ts"
    title: Native and real scoped-rg common consumer, errors, deadlines and permission tests
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/FileSystem.ts"
    title: Exact installed Effect 4.0.1 filesystem signature
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/process/ChildProcess.ts"
    title: Exact installed Effect 4.0.1 process command/options implementation
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/process/ChildProcessSpawner.ts"
    title: Exact scoped spawner/handle ownership and output streams
  - resource: "file:///home/rektide/archive/facebook/watchman/watchman/thirdparty/wildmatch/wildmatch.c"
    title: Byte-oriented question-mark behavior and embedded double-star handling
  - resource: "file:///home/rektide/archive/facebook/watchman/watchman/root/warnerr.cpp"
    title: Permission-denied crawls can mark subtrees deleted and latch a warning
  - resource: "file:///home/rektide/archive/facebook/watchman/watchman/listener-user.cpp"
    title: Root warnings are carried on command/query responses
---

# Enumeration verification receipt

## Implemented revisions

| Library | Coherent stages |
|---|---|
| Watchman | `a3e1b336` structural contract; `dd1c5f83` daemon enumeration/supplements; `26161dc3` shared combined composition; **`d127d12b`** npm-backed directory view, final request modes and error/resource refinements |
| Plus | `d132a659` structural contract; `2bf291b1` native/rg baselines; **`fe22978c`** npm traversal, non-directory kind and final native/rg contract |

These are source commits, not published releases or OpenCode vendor refreshes.
Both generated dist trees were built locally. No shared daemon or live OpenCode
service was contacted. Every real Watchman fixture owns a private foreground
`/usr/local/bin/watchman-facebook` daemon and scratch state under `/tmp/opencode`.
No pushes, daemon config rewrites, automatic reconnect, root pruning or FFF changes.

## Final checks

Run from each library directory:

- `bun run typecheck`: passed in both.
- `bun run build`: passed in both, including public ESM and declarations.
- Plus `bun run test`: **28 passed**, no skips/failures, 212 assertions.
- Watchman `WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook WATCH_TEST_DIRECTORY=/tmp/opencode bun run test`:
  **31 passed**, no skips/failures, 302 assertions.
- Watchman query transport `--rerun-each 10`: **20 passed**, 170 assertions.
- Watchman real enumeration `--rerun-each 10`: **20 passed**, 750 assertions.
- Plus enumeration `--rerun-each 10`: **30 passed**, 290 assertions.
- Actual **Node v26.6.0**, built ESM, private daemon, npm glob oracle and all
  three provider implementations: passed the same structural file consumer and
  eight ordinary glob comparisons. The scratch smoke is documented under
  `.test-agent/node-smoke/`; it is not a shipped dependency or permanent test API.

The common consumer uses only root/patterns/kind/dot/symlinks and Entry.path; it
does not inspect provider-specific wire objects. Identical committed consumers
live in both test/consumer.ts files. Native and rg results matched the daemon's
declared file selection in the real Node process, not merely under Bun's shim.

## Properties actually checked

- Selective `src/**/*.ts` pushdown remains that generator, not an all-name query.
  Braces expand; classes/extglobs retain safe literal edges and residual matching.
  Question marks widen because Watchman's byte matcher differs on Unicode; widened
  consecutive stars collapse so embedded `**` cannot accidentally become a subset.
  Unicode é/emoji, escaped brackets, newline/space names and dotfiles are fixtures.
- npm-default symlink mode uses npm's real traversal, with daemon candidate
  directories and native reads only through link paths. Literal-prefix aliases,
  wildcard prefixes, recursive full-follow aliases, external targets, dangling
  links, empty/ordinary directories, excludes and root selection are covered.
- Configured ignored directories/VCS subtrees are deliberately supplemented for
  filesystem coverage; daemon coverage explicitly omits them. Nested requests use
  relative_root. Outside approval fails. Symlink roots outside the approved daemon
  boundary are scanned locally without acquiring the target root.
- The same socket and one exact `watch` acquisition serve watching and enumeration;
  scripted peers see no `watch-project` in the combined route. Canceling a query
  leaves its wire owner until reply; a sibling watch still receives events. Query
  byte/schema/warning failures do not destroy that healthy socket.
- Name-only string rows and rich rows with optional/null metadata decode through
  the query schema without subscription-field stripping. Requested missing metadata
  fails; no fabricated stat object escapes. Full-query fresh-instance is accepted.
- An **8,000-file baseline exceeding 1 MiB** succeeds with the new deliberate frame
  budgets. Result-byte overflow fails, not truncates. A silent query reaches its
  on-wire deadline; invalid query sync/lock/deadline combinations fail preflight.
- Native permission denial fails in literal, follow and npm modes. Watchman crawl
  warnings fail baselines rather than accepting deleted/unobserved subtrees. The
  permission fixture removes access **before root acquisition**: chmod after a
  completed crawl can legitimately leave a complete cached membership, so requiring
  an immediate warning there was not a sound test.
- Rg uses the supplied scoped Effect spawner, NUL framing, explicit ignore policy,
  concurrent stdout/stderr/exit draining, caller-placement inspection, byte limits
  and a deadline. Exit 2, invalid framing/escaping and resource overflow fail without
  returning a partial success. Native watch behavior remains covered by its prior
  suite, not replaced by a new watcher.

## Actual Node versus npm, not an equivalence claim

In the real Node v26.6.0 smoke, the daemon/npm mode and Node glob agreed for `*`,
`**`, `**/*.ts`, `alias/**/*.ts`, `**/`, and `src/@(a|b).ts` in the fixture.
They differed for `.` (npm/daemon returned root `.`, Node returned none) and
`a\\[1\\].ts` (npm/daemon matched the literal bracket name, Node returned none).
The library therefore documents an npm-compatible dialect, **not exact Node glob
parity**. Bun's node:fs glob shim is not used as that compatibility authority.

`kind:files` means regular/target-regular files. Discovery that needs broken links
or special entries can use `kind:non-directories`, which deliberately rejects real
and target directories. This does not pretend that every npm nodir/follow combination
has identical lexical-link classification.

## Remaining limits

- No aligned baseline-to-changes capability, catch-up, reconnect, portable clock
  serialization or atomic file-content snapshot. Query-only checkpoints are opaque
  owner-bound evidence for a future aligned operation, not that operation itself.
- Absolute and parent-segment patterns are explicit unsupported scope; applications
  can preselect native for those patterns. Ancestor discovery should remain native,
  not approve home/root just to accelerate a short scan.
- Native supplements require the daemon filesystem to be locally accessible at the
  same paths. Remote applications must preserve their placement seam.
- Rg remains strictly file-only and cannot implement npm's pattern-dependent link
  traversal or all/non-directory inventories. It uses --follow to retain file links;
  dangling-link/cycle traversal errors fail even literal requests. Its lexical
  inspector is caller-supplied and currently inspects candidate files/cached parents.
- Daemon responses are whole arrays. Query byte budgets do not cap supplementary
  native arrays, and the shared socket can have query head-of-line latency. No
  pagination, transport pool or universal CPU/RSS/memory improvement is claimed.
- Watchman warnings are rejected conservatively, including when a smaller selection
  might be unaffected. The library does not clear warnings by mutating daemon roots.

The maintained API is [ENUMERATION.md](../../ENUMERATION.md). The
[initial contract checkpoint](enumeration-contract0.sol61x.md) connects this receipt
to the [larger baseline proposal](baseline-enumeration0.sol61x.md); the proposal's
aligned-continuity work remains subsequent.
