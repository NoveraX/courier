/**
 * The landing page deletes hand-written code as the reader scrolls. Each
 * point of the scroll must show a consistent refactor: lines struck in
 * order, a chunk's file closing once its lines are gone, and the typed
 * lines arriving only at the end.
 */
import { describe, expect, it } from "vitest"

import { NEW_LINES, OLD_LINES } from "@/site/landing/refactor/refactor-code"
import { refactorFrame, refactorStop } from "@/site/landing/refactor/refactor-frame"

const SAMPLES = Array.from({ length: 4001 }, (_, at) => at / 4000)

describe("the refactor as it is scrolled", () => {
  it("starts with every hand-written line, three files and nothing added", () => {
    const frame = refactorFrame(0)

    expect(frame.lines.slice(0, OLD_LINES.length).every((state) => state === "kept")).toBe(true)
    expect(frame.lines.slice(OLD_LINES.length).every((state) => state === "hidden")).toBe(true)
    expect(frame).toMatchObject({ struck: 0, done: false, filesLeft: 3, linesLeft: 20 })
    expect(frame.steps).toEqual(["idle", "idle", "idle", "idle"])
  })

  it("strikes the fetch line by line, the first step active", () => {
    const early = refactorFrame(0.1)
    const later = refactorFrame(0.3)

    expect(early.lines[0]).toBe("struck")
    expect(early.lines[1]).toBe("kept")
    expect(later.struck).toBeGreaterThan(early.struck)
    expect(later.steps[0]).toBe("active")
  })

  it("removes the fetch once its chunk ends, and closes the proxy route's tab after its own", () => {
    const frame = refactorFrame(0.59)

    expect(frame.lines.slice(0, 17).every((state) => state === "gone")).toBe(true)
    expect(frame.steps.slice(0, 2)).toEqual(["done", "done"])
    expect(frame.tabs[1]).toEqual({ closed: true, active: false })
    expect(frame.filesLeft).toBe(2)
  })

  it("ends with one file, the hand-written code gone and the three typed lines in", () => {
    const frame = refactorFrame(1)

    expect(frame.lines.slice(OLD_LINES.length)).toEqual(NEW_LINES.map(() => "added"))
    expect(frame).toMatchObject({ struck: 20, done: true, filesLeft: 1, linesLeft: 3 })
    expect(frame.steps).toEqual(["done", "done", "done", "won"])
  })
})

/**
 * The section re-renders only when the scroll crosses a stop, so a stop
 * must show exactly the frame of every point up to the next one — or the
 * reader would see the refactor lag behind the scroll.
 */
describe("the stops the refactor's frame changes at", () => {
  const stops = [...new Set(SAMPLES.map(refactorStop))]

  it("shows at each point the frame of the stop it snaps to", () => {
    for (const progress of SAMPLES) {
      expect(refactorFrame(refactorStop(progress))).toEqual(refactorFrame(progress))
    }
  })

  it("changes the frame at every stop, and at no point just before one", () => {
    for (const stop of stops.slice(1)) {
      const before = stop - 1e-9

      expect(refactorStop(stop)).toBe(stop)
      expect(refactorFrame(stop)).not.toEqual(refactorFrame(before))
      expect(refactorFrame(refactorStop(before))).toEqual(refactorFrame(before))
    }
  })

  it("comes to a few dozen through the whole scroll, not one per frame", () => {
    expect(stops[0]).toBe(0)
    expect(stops.length).toBeGreaterThan(20)
    expect(stops.length).toBeLessThan(60)
  })
})
