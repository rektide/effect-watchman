---
type: ImplementationContract
title: Enumeration v1 consumer checkpoint
description: Shared structural baseline contract and builder ownership for Watchman and Watch Plus.
resource: /design/watch/enumeration-contract0.sol61x.md
status: active implementation
author: GPT-6.1 Sol xhigh
date: 2026-10-19
sources:
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Library contract, daemon candidate planning, and explicit local supplementation design
  - resource: /design/watch/baseline-enumeration0.sol61x.md
    title: Commissioned baseline and enumeration proposal, read fully
  - resource: /src/Enumeration.ts
    title: Executable structural contract
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/effect/src/FileSystem.ts"
    title: Installed Effect 4.0.1 glob signature
  - resource: "file:///home/rektide/src/effect-watch-plus/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts"
    title: Installed native glob delegation
---

# Enumeration v1 consumer checkpoint

`src/Enumeration.ts` is copied identically into both independent packages. It is
a structural contract, not a third runtime package. Neither library depends on
the other. Watch-only entrypoints keep their current behavior.

The checked view has `enumerate(Request)` and richer `glob(pattern, options)`.
The marker is `~effect-watch/enumeration/v1`, distinct from watch options/v2.
`enumerate` requires a root; ordinary glob defaults to the captured cwd adapter.
Entries use slash-separated relative lexical names, with `.` for the root when
matched. Matching is minimatch 10 with braces, extglobs, classes, escaping,
globstar, `nonegate: true`, `nocomment: true`, no basename-only matching, and
explicit dot/nocase flags. Directory trailing slashes are accepted. Excludes
match whole relative names and prune matching directories and their descendants.
No implicit watch ignores or Git ignores enter literal enumeration.

The default selection is `patterns: ["**/*"]`, `kind: "all"`, `dot: false`,
`nocase: false`, `symlinks: "literal"`, `metadata: false`, `policy: "literal"`,
`coverage: "filesystem"`. Literal links are listed, not recursively traversed;
file/directory kind selection uses target classification for links. Broken links
remain all-entry candidates. Follow traversal is cycle-bounded by ancestor real
directory identities, not by globally suppressing aliases.

Native and ripgrep return scanned baselines. Watchman-only daemon results return
an owner-bound opaque checkpoint. Explicit local supplementation (ignored daemon
subtrees or followed links) returns a scanned baseline, not a falsely coherent
clock. All successful baselines are complete for the declared coverage; budgets,
permission failures and rg errors fail. No runtime error switches providers.
`coverage: "daemon"` deliberately requests the daemon's configured observed
scope; it is not a complete literal filesystem inventory. `policy: "gitignore"`
is the explicit ripgrep search profile, unsupported elsewhere until implemented.

## Integration entrypoints

- Plus root exports `Glob` and `Ripgrep` alongside existing `WatchPlus`.
- `Glob.nativeBackend(...)` implements this Backend; `Glob.make` decorates a
  captured filesystem; `Glob.layer` is additive and glob-only.
- `Ripgrep.make({ executable, spawner, ...budgets })` implements file-only Backend.
  Caller placement/spawner is preserved; all-entry requests fail explicitly.
- Watchman root exports `Glob` alongside `Watchman`; `Glob.layer(options)` is
  glob-only. `Watchman.layerWithGlob(options)` constructs one internal manager
  for both watch and query. `Watchman.layer(options)` remains watch-only.
- In either package, `Glob.fileSystem` checks the enumeration view.

This checkpoint freezes Request/Entry/Baseline/Backend/GlobOptions and matching
policy for disjoint builders. Function argument details can be supplied by their
owner without changing consumer requests. Baseline-to-changes continuity is not
implemented or promised by this contract.

## Builder boundaries

The primary builder owns Watchman implementation and its copied contract.
A parent-commissioned second builder may own all Plus implementation, tests and
documentation after copying this contract unchanged. Test cross-package consumers
structurally, not through a new runtime dependency. Coordination must precede
contract changes. A Plus implementation can use node lstat/readdir for exact
symlink semantics, but the optional rg adapter must use its supplied scoped Effect
spawner, not node child_process or an application environment singleton.

The prior [enumeration proposal](baseline-enumeration0.sol61x.md#first-implementation-slice-and-next-checkpoint)
provides the larger rationale and subsequent aligned-continuity checkpoint.
