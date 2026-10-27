---
type: Overview
title: effect-watchman
description: Independent Effect watching and additive approved-root glob enumeration.
resource: /README.md
status: active
author: GPT-6.1 Sol xhigh
date: 2026-10-19
sources:
  - resource: "opencode://ses_e87038c1affeHRNE9v4Ggec0Sl"
    title: Document additive recovery signals and the replaced shared-owner terminal-loss behavior
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Added the additive enumeration entrypoint and API reference; retained watch-only documentation
  - resource: /ENUMERATION.md
    title: Glob and baseline API details
---

# effect-watchman

Independent enhanced Effect **4.0.1** filesystem watching through an explicitly
configured Watchman Unix socket. No Watch Plus runtime or layer is required.

**Glob/enumeration is additive:** use `Glob.layer({ socketPath, approvedRoots })`
or `Watchman.layerWithGlob(...)` for shared watch/query ownership. This includes
selective daemon queries, npm glob traversal, explicit native symlink/ignored-root
supplements and complete baselines. The existing `Watchman.layer` stays watch-only.
See [enumeration API and limits](ENUMERATION.md).

```ts
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Stream } from "effect"
import { Watchman } from "effect-watchman"

const filesystem = Watchman.layer({ socketPath: "/path/to/watchman.sock" }).pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
)
const program = Effect.gen(function*() {
  const fs = yield* Watchman.fileSystem
  yield* fs.watch(".", {
    recursive: true,
    ignore: ["node_modules", ".git", "**/{node_modules,.git}/**", "**/*.log"]
  }).pipe(Stream.runForEach((event) => Effect.log(event)))
}).pipe(Effect.provide(filesystem))
```

- `layer({ socketPath })`: enhanced filesystem with one scoped connection/manager.
- `backendLayer({ socketPath })`: ordinary Effect WatchBackend. Provide it to
  `NodeFileSystem.layer` **at construction**. For both routes sharing one owner,
  reuse this exact layer value with `fromBackend` and the Node filesystem layer.
- `fromBackend`: capture one provided Effect WatchBackend and base filesystem/
  Path; replace only watch. It never calls native watch; backend `None` fails.
- `fileSystem`: checked typed view of the same Effect filesystem object; absent
  `~effect-watch/options/v2: true` fails rather than silently ignoring options;
  the older literal-only v1 marker is rejected.
- `make(fs, path, backend)`: explicit direct construction/testing seam.
- `make(fs, path, backend, policy)` / `configured(policy)`: instance-wide
  `ignore` and `defaultIgnores` for the enhanced filesystem. `layer` accepts
  these policy fields alongside socket/connection options.
- `ignore`: relative literal subtrees or whole-path globs, compiled once with
  **minimatch 10.0.3**. Supports globstar, `*`, `?`, braces, and dotfiles; filtering
  is path-only, including deletes. No Git-ignore/reinclude semantics. Absolute,
  empty, parent-segment and leading-negation patterns fail. See the complete
  [v2 ignore contract](IGNORE.md) for anchoring, escaping and malformed patterns.
- `defaultIgnores`: defaults to `true`. Suppresses `.watchman-cookie-*` files
  and subtrees at any depth, including create/delete hints. Set `false` to
  expose cookies without disabling any supplied ignores. Instance and per-watch
  `ignore` arrays are unioned/deduplicated; the per-watch boolean overrides the
  instance boolean. The enhanced layer applies this policy after raw daemon
  delivery, so a per-watch opt-out is not defeated by unconditional filtering
  deeper in the backend. Standalone `backendLayer` also accepts
  `defaultIgnores: false`; it has no per-watch enhanced policy. Neither library
  layer reads process environment variables or configuration files.
- `followReplacements: true`: existing file parent-anchor, filter basename;
  parent/root replacement and missing targets are not supported.
  It watches the lexical entry, not writes through symbolic links to a referent.

Ordinary streams emit Create/Update/Remove hints and still fail on continuity
loss. Reconcile before explicitly reopening after loss. The shared owner now
recovers its connection, so new operations can use the replacement generation.
**Opt-in:** `Recovery.fileSystem` returns a checked signal capability whose watches
retain desired interests and emit acknowledged attachment/reset boundaries before
later events. It also exposes passive owner health. No fake root update, mandatory
observation service, portable cursor or native fallback. See [recovery contract](RECOVERY.md).
Ordinary Effect consumers and non-watch methods remain usable. Plus's checked
accessor is structurally interoperable but no Plus dependency is installed.

The manager uses `watch-project`, then `clock` / `subscribe` with `since`; initial
full inventory is not emitted as fake creates. Events use absolute logical paths,
with canonical directory routing and independent named subscriptions. Same-directory
project acquisition is cached; daemon roots are shared, but overlapping subscriptions
are not merged. Closing a consumer unsubscribes it; closing the layer destroys its
socket. Daemon-owned root watches are not deleted. Ignores are userland filters.

Defaults: connect/request 3000ms, cleanup 500ms, JSON frame 1MiB, 128 active/queued
commands, 1024 buffered events per consumer. `Options` exposes corresponding
`connectTimeoutMs`, `requestTimeoutMs`, `cleanupTimeoutMs`, `maxFrameBytes`,
`maxPendingCommands`, `maxBufferedEvents`; all must be positive finite integers.
For ordinary watches, disconnect, canceled subscription, fresh history, malformed/mismatched replies,
deadline expiry and local overflow fail visibly. Canceling an unsent command
removes only that request. Canceling a transmitted command interrupts its caller
but retains the wire reply owner/deadline; late attachment acknowledgements are
followed by scoped unsubscribe without disrupting healthy siblings. Cleanup may
wait up to request + cleanup timeout in the queue, then has its own cleanup
timeout after transmission; silence/corruption can still terminate the shared
connection. Cached project acquisition is manager-owned, not tied to the first
requester's lifetime. Ordinary watches are not transparently retried; recovery
signals are a separate opt-in route. There is no discovery, autospawn, catch-up API,
arbitrary symlink traversal or topology-replacement guarantee.
Daemon `ignore_dirs` / `ignore_vcs` still constrain coverage.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
# Opt-in, owned isolated foreground stock daemon (never ambient daemon):
WATCHMAN_TEST_BINARY=/usr/local/bin/watchman-facebook \
  WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test:daemon
```

Without `WATCHMAN_TEST_BINARY`, live tests skip. The live fixture covers public
ordinary/enhanced watches, changes/deletions, scope/ignore selection, atomic save
then later edit, sibling release, no initial inventory and read-only quietness.
See [HANDOFF.md](HANDOFF.md) for verified daemon version and remaining limits.
# Observed inventory

`Inventory.fileSystem` exposes the scoped source installed by `Glob.layer` and
`Watchman.layerWithGlob`: a clock-joined baseline, epoch-tagged live changes and
explicit invalidation/rebaseline. See the [Gate A API and receipt](doc/inventory/observed-source0.sol61x.md).
