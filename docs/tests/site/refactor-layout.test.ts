/**
 * The refactor's twenty hand-written lines must fit the window below the
 * header, whatever its height, without the code growing past its full
 * size or shrinking past legibility.
 */
import { describe, expect, it } from "vitest"

import {
  codeFontSize,
  codeLineHeight,
  codeRoom,
  codeWindow,
  narrativeBeside,
  SIDEWAYS,
  STATUS_WRAPS,
} from "@/site/landing/refactor/refactor-layout"

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

describe("the refactor's stage in a short window", () => {
  it("sets the narrative beside the code on a phone held sideways, and above it held upright", () => {
    expect(narrativeBeside({ width: 844, height: 360 })).toBe(true)
    expect(narrativeBeside({ width: 390, height: 844 })).toBe(false)
    expect(narrativeBeside({ width: 700, height: SIDEWAYS.below })).toBe(false)
    expect(narrativeBeside({ width: 1200, height: 900 })).toBe(true)
  })

  it("shows the code through a window where even its shortest lines do not all fit", () => {
    const sideways = { width: 844, height: 360, narrative: 90 }
    const small = { width: 375, height: 553, narrative: 62 }

    expect(codeWindow(sideways, codeLineHeight(sideways))).toBe(144)
    expect(codeLineHeight(small)).toBe(14)
    expect(codeWindow(small, 14)).toBe(250)
  })

  it("never makes the window shorter than four lines", () => {
    expect(codeWindow({ width: 844, height: 250, narrative: 0 }, 14)).toBe(56)
  })

  it("needs no window where all twenty lines fit", () => {
    expect(codeWindow({ width: 1440, height: 900, narrative: 0 }, 23)).toBeUndefined()
    expect(codeWindow({ width: 390, height: 760, narrative: 90 }, 17)).toBeUndefined()
  })

  it("gives the lines the room the narrative leaves when it moves beside them", () => {
    const upright = codeRoom({ width: 600, height: 360, narrative: 90 })
    const sideways = codeRoom({ width: 844, height: 360, narrative: 90 })

    expect(sideways - upright).toBe(104)
  })
})
