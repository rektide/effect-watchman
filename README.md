# effect-watchman

Independent enhanced Effect **4.0.1** filesystem watch seam. This baseline has
**no Watchman daemon transport yet**; a later stage supplies the scoped backend.
It already implements the same additive options as `effect-watch-plus` directly,
without constructing or depending on a Plus policy layer.

```ts
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Stream } from "effect"
import { Watchman } from "effect-watchman"

// backend: Layer<FileSystem.WatchBackend> from the future scoped daemon manager
const filesystem = Watchman.fromBackend.pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, backend))
)
const program = Effect.gen(function*() {
  const fs = yield* Watchman.fileSystem
  yield* fs.watch(".", {
    recursive: true,
    ignore: ["generated"]
  }).pipe(Stream.runForEach((event) => Effect.log(event)))
}).pipe(Effect.provide(filesystem))
```

- `fromBackend`: capture one provided Effect WatchBackend and base filesystem/
  Path; replace only watch. It never calls native watch; backend `None` fails.
- `fileSystem`: checked typed view of the same Effect filesystem object; absent
  enhancement support fails rather than silently ignoring options.
- `make(fs, path, backend)`: explicit direct construction/testing seam.
- `ignore`: literal relative paths/subtrees (not globs), directory-relative for
  directory watches, parent-relative for files. Includes dotfiles, case-sensitive;
  trailing separators normalize; absolute/empty/escaping paths fail.
- `followReplacements: true`: existing file parent-anchor, filter basename;
  parent/root replacement and missing targets are not implemented yet.
  It watches the lexical entry, not writes to an external symlink referent.

Streams emit ordinary Create/Update/Remove hints. Known completion fails with
PlatformError/UnexpectedEof; failures propagate. Reconcile before reopening after
loss. No fake root update, readiness/cursor/resync guarantee or native fallback.
Ordinary Effect consumers and non-watch methods remain usable. Plus's checked
accessor is structurally interoperable but no Plus dependency is installed.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
```

Tests are transport-independent seam/ownership proofs, not daemon certification.
They accept `WATCH_TEST_DIRECTORY` for temporary storage. See [HANDOFF.md](HANDOFF.md)
and the [architecture gate](design/watch/additive-gate.md) for the next stage.
