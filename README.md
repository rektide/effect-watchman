# effect-watchman

Independent enhanced Effect **4.0.1** filesystem watching through an explicitly
configured Watchman Unix socket. No Watch Plus runtime or layer is required.

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
    ignore: ["generated"]
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
  enhancement support fails rather than silently ignoring options.
- `make(fs, path, backend)`: explicit direct construction/testing seam.
- `ignore`: literal relative paths/subtrees (not globs), directory-relative for
  directory watches, parent-relative for files. Includes dotfiles, case-sensitive;
  trailing separators normalize; absolute/empty/escaping paths fail.
- `followReplacements: true`: existing file parent-anchor, filter basename;
  parent/root replacement and missing targets are not supported.
  It watches the lexical entry, not writes through symbolic links to a referent.

Streams emit ordinary Create/Update/Remove hints. Known completion fails with
PlatformError/UnexpectedEof; failures propagate. Reconcile before reopening after
loss. No fake root update, readiness/cursor/resync guarantee or native fallback.
After terminal **connection** failure, the existing layer's manager stays terminal:
rerunning `fs.watch` on that instance cannot repair it. Rebuild the layer in a new
scope before watching again; there is no automatic reconnect.
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
Disconnect, canceled subscription, fresh history, malformed/mismatched replies,
deadline expiry and local overflow fail visibly. Canceling an unsent command
removes only that request. Canceling a transmitted command interrupts its caller
but retains the wire reply owner/deadline; late attachment acknowledgements are
followed by scoped unsubscribe without disrupting healthy siblings. Cleanup may
wait up to request + cleanup timeout in the queue, then has its own cleanup
timeout after transmission; silence/corruption can still terminate the shared
connection. Cached project acquisition is manager-owned, not tied to the first
requester's lifetime. There is no transparent retry, discovery, autospawn, catch-up API,
attachment-readiness API, symlink traversal or topology-replacement guarantee.
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
