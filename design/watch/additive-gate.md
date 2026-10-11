# Additive watch gate — passed

2026-10-10, GPT-6.1 Sol. The latest user direction supersedes the mandatory
Plus-observation/adapter architecture preserved at `a31fda8d`.

The full source and experiment account is in
[Watch Plus's additive gate](https://github.com/rektide/effect-watch-plus/blob/main/design/watch/additive-gate.md)
(local checkout: `/home/rektide/src/effect-watch-plus/design/watch/additive-gate.md`).

Pinned Effect/platform-node-shared 4.0.1, Bun 1.4.2/Linux:
`/home/rektide/tmp-opencode/watch-additive-gate`: strict `bun run typecheck`
passed; `bun test` **5 passed, 0 failed**. A backend implemented the same typed
`fs.watch(path, { recursive, ignore, followReplacements })` consumer independently,
without constructing the native Plus decorator. The real Node filesystem Layer
selected its captured backend. Real native atomic replacement + following edit
also passed; this is not evidence of a working Watchman transport.

Choose an explicit checked typed filesystem view over global module augmentation.
The view returns the same enhanced object stored at Effect's `FileSystem` key.
Ordinary consumers and methods stay unchanged. Providers advertise the versioned
structural marker `~effect-watch/options/v2` (evolved from literal-only v1;
see [current ignore contract](../../IGNORE.md)); an unenhanced filesystem is rejected
with `PlatformError/BadArgument`. No separate observation service is required.

Baseline now implemented: Watchman `8a5313d4`, Plus `481abfcc`. Typechecks and
builds passed in both repos; **6 Watchman seam tests**, **8 Plus/native tests**.
One backend owner is captured and shared; None and known completion fail, and
sibling stream scopes release independently. No Plus runtime dependency exists.
Tarballs installed into `/home/rektide/tmp-opencode/watch-additive-consumer` passed
**3 public-export tests** and strict typecheck: identical consumer on either
provider without constructing Plus's decorator for Watchman, and one consumer
Effect runtime identity. Maintained consumer proof is in the Plus design home.

A later stage supplies the actual scoped daemon backend, transport and live
conformance tests. Plain events cannot encode ready, resync or clocks: fail on
known continuity loss, or offer optional explicit coherent helpers. No Plus
runtime/policy layer is mandatory. No daemon or live service was used here.
