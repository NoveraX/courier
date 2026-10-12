/**
 * The refactor's code seen through a window shorter than it, on a phone
 * held sideways or a small one: scrolled just far enough that the line
 * changed last shows, as an editor follows an edit.
 */
import { describe, expect, it } from "vitest"

import { NEW_LINES, OLD_LINES } from "@/site/landing/refactor/refactor-code"
import type { LineState } from "@/site/landing/refactor/refactor-frame"
import { refactorFrame } from "@/site/landing/refactor/refactor-frame"
import { codeScroll } from "@/site/landing/refactor/refactor-scroll"

const LINE = 14
const WINDOW = 144

/* The hand-written lines in the states given from the top, the rest kept, the new ones not yet in. */
function lines(...top: LineState[]): LineState[] {
  return [
    ...OLD_LINES.map((_, at) => top[at] ?? "kept"),
    ...NEW_LINES.map((): LineState => "hidden"),
  ]
}

describe("codeScroll", () => {
  it("does not scroll before the first change", () => {
    expect(codeScroll(refactorFrame(0).lines, LINE, WINDOW)).toBe(0)
  })

  it("scrolls just far enough that the last struck line shows with the one after it", () => {
    const struck = lines(...Array.from({ length: 11 }, (): LineState => "struck"))

    expect(codeScroll(struck, LINE, WINDOW)).toBe(12 * LINE - WINDOW)
  })

  it("never scrolls past the last line", () => {
    const struck = lines(...Array.from({ length: 19 }, (): LineState => "struck"))

    expect(codeScroll(struck, LINE, WINDOW)).toBe(OLD_LINES.length * LINE - WINDOW)
  })

  it("scrolls back up as the struck lines above close up", () => {
    const gone = Array.from({ length: 12 }, (): LineState => "gone")

    expect(codeScroll(lines(...gone, "struck", "struck"), LINE, WINDOW)).toBe(0)
  })

  it("keeps the line changed last in view at every point of the scroll", () => {
    for (let progress = 0; progress <= 1; progress += 0.005) {
      const states = refactorFrame(progress).lines
      const rows = states.filter((state) => state !== "gone" && state !== "hidden")
      const last = rows.findLastIndex((state) => state === "struck" || state === "added")
      const scroll = codeScroll(states, LINE, WINDOW)

      const top = last * LINE - scroll
      const inView = last < 0 || (top >= 0 && top + LINE <= WINDOW)
      expect({ progress, inView }).toEqual({ progress, inView: true })
    }
  })
})
