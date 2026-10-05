/**
 * The landing's comparison: each tool scored by the needs it meets in full,
 * out of the twelve, and Courier meeting every one of them.
 */
import { describe, expect, it } from "vitest"

import { COMPARE_ROWS, COMPARED, scoreOf } from "@/site/landing/compare/compare-data"

describe("the comparison", () => {
  it("scores each tool by the needs it meets in full", () => {
    expect(COMPARED.map((_, column) => scoreOf(column))).toEqual([
      "2 / 12",
      "3 / 12",
      "7 / 12",
      "12 / 12",
    ])
  })

  it("says how each tool meets each need, in a word or two", () => {
    for (const row of COMPARE_ROWS) {
      expect(row.cells).toHaveLength(COMPARED.length)
      for (const cell of row.cells) expect(cell.text.split(" ").length).toBeLessThanOrEqual(4)
    }
  })
})
