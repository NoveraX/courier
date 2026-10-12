/**
 * The refactor's twenty hand-written lines must fit the window below the
 * header, whatever its height, without the code growing past its full
 * size or shrinking past legibility.
 */
import { describe, expect, it } from "vitest"

import { codeFontSize, codeLineHeight, STATUS_WRAPS } from "@/site/landing/refactor/refactor-layout"

describe("the refactor's code size", () => {
  it("uses the full line height in a tall window", () => {
    expect(codeLineHeight({ width: 1440, height: 1000, narrative: 0 })).toBe(23)
    expect(codeFontSize(23)).toBe(12)
  })

  it("tightens the lines in a short window, never below 14 px", () => {
    expect(codeLineHeight({ width: 1440, height: 600, narrative: 0 })).toBe(19)
    expect(codeLineHeight({ width: 1440, height: 400, narrative: 0 })).toBe(14)
    expect(codeFontSize(14)).toBe(10)
  })

  it("leaves room for the narrative above the code on a narrow window", () => {
    const wide = codeLineHeight({ width: 1200, height: 640, narrative: 90 })
    const narrow = codeLineHeight({ width: 390, height: 640, narrative: 90 })

    expect(wide).toBe(21)
    expect(narrow).toBe(15)
  })

  it("leaves room for the status line's second line on a phone", () => {
    const phablet = codeLineHeight({ width: STATUS_WRAPS, height: 710, narrative: 34 })
    const phone = codeLineHeight({ width: STATUS_WRAPS - 1, height: 710, narrative: 34 })

    expect(phablet).toBe(22)
    expect(phone).toBe(21)
  })
})
