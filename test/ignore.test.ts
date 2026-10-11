import { expect, test } from "bun:test"
import { NodePath } from "@effect/platform-node"
import { Effect, Path } from "effect"
import { compileIgnore } from "../src/Ignore.js"
import { cases, ignores } from "./ignore-cases.js"

for (const windows of [false, true]) {
  test(`compiled ignore contract with ${windows ? "Windows" : "POSIX"} Path`, async () => {
    await Effect.runPromise(Effect.gen(function*() {
      const path = yield* Path.Path
      const excluded = compileIgnore(ignores, path)
      for (const [name, included] of cases) expect(excluded(windows ? name.replaceAll("/", "\\") : name)).toBe(!included)
      for (const invalid of ["", ".", "./", "..", "../x", "a/../x", "/x", "\\x", "C:/x", "C:x", "\\\\host\\x", "!keep", "!(*.log)", "{..,safe}/x", "{/absolute,safe}", "{C:/x,safe}"]) {
        expect(() => compileIgnore([invalid], path)).toThrow()
      }
      expect(compileIgnore(["**/{node_modules,.git}/**"], path)("deep/node_modules")).toBe(false)
      expect(compileIgnore(["**/node_modules"], path)("deep/node_modules/pkg")).toBe(false)
      expect(compileIgnore(["**/node_modules"], path)("deep/node_modules")).toBe(true)
      expect(compileIgnore(["#comment"], path)("#comment/child")).toBe(true)
      expect(compileIgnore(["*.log"], path)("deep/a.log")).toBe(false)
      expect(compileIgnore(["*.log"], path)(".a.log")).toBe(true)
    }).pipe(Effect.provide(windows ? NodePath.layerWin32 : NodePath.layerPosix)))
  })
}
