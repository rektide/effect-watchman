import { Effect } from "effect"
import type { Backend } from "../src/Enumeration.js"

/** Identical consumer exercised by all three providers, with no provider fields. */
export const inventory = (backend: Backend, root: string) => Effect.map(backend.enumerate({
  root, patterns: ["**/*.{ts,js}"], kind: "files", dot: false, symlinks: "literal"
}), (baseline) => baseline.entries.map((entry) => entry.path))
