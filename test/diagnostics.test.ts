import { expect, test } from "bun:test"
import { capture, measure } from "../src/Diagnostics.js"

test("integration diagnostics remain bounded and do not retain frame contents", () => {
  const diagnostic = capture()
  try {
    for (let index = 0; index < 2048; index++) measure("sort", () => undefined, 1, 1)
    expect(diagnostic.result.samples).toHaveLength(512)
    expect(diagnostic.result.droppedSamples).toBe(1536)
    expect(diagnostic.result.phases.sort.calls).toBe(2048)
    expect(diagnostic.result.phases.sort.rows).toBe(2048)
  } finally { diagnostic.stop() }
})
