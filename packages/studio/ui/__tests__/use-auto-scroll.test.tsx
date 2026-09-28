/**
 * @vitest-environment jsdom
 */
/**
 * The Timeline and the mock logs list the newest entry first. Following new
 * entries therefore means keeping the head of the list in view; scrolling to
 * the bottom pinned the view to the oldest entry while new ones arrived
 * out of sight above it.
 */
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useAutoScroll } from "@/hooks/use-auto-scroll"

/** A scroll box jsdom lays out as `rows` rows of 36px in a 360px viewport. */
function scrollBox(rows: number, scrollTop: number): HTMLDivElement {
  const el = document.createElement("div")
  let top = scrollTop
  Object.defineProperties(el, {
    clientHeight: { get: () => 360 },
    scrollHeight: { get: () => Math.max(360, rows * 36) },
    scrollTop: { get: () => top, set: (value: number) => (top = value) },
  })
  return el
}

function follow(el: HTMLDivElement, count: number) {
  const ref = { current: el }
  const enabled = { current: true }
  return renderHook(({ n }) => useAutoScroll(ref, n, enabled), { initialProps: { n: count } })
}

describe("following new entries of a newest-first list", () => {
  it("keeps the newest entry in view when a short list grows", () => {
    const el = scrollBox(11, 0)
    const { rerender } = follow(el, 11)

    rerender({ n: 12 })

    expect(el.scrollTop).toBe(0)
  })

  it("brings the head back into view for a reader just below it", () => {
    const el = scrollBox(100, 40)
    const { rerender } = follow(el, 100)

    rerender({ n: 101 })

    expect(el.scrollTop).toBe(0)
  })

  it("leaves a reader who scrolled down to older entries where they are", () => {
    const el = scrollBox(100, 1800)
    const { rerender } = follow(el, 100)

    rerender({ n: 101 })

    expect(el.scrollTop).toBe(1800)
  })
})
