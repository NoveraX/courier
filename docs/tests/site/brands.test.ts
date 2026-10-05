/**
 * Brand tiles draw a pale brand colour in the text colour, so it stays
 * visible on the light ground; the rest keep their own colour and cast it
 * as a glow.
 */
import { describe, expect, it } from "vitest"

import { ADAPTER_BRANDS, isPale, RUNTIME_BRANDS, rgbOf } from "@/site/landing/brands"

describe("brand colours", () => {
  it("reads a colour's channels", () => {
    expect(rgbOf("#00dc82")).toEqual([0, 220, 130])
  })

  it("draws a pale mark in the text colour and keeps a saturated one", () => {
    expect(isPale("#f2f3f5")).toBe(true)
    expect(isPale("#00dc82")).toBe(false)
  })

  it("gives every brand a mark to draw", () => {
    for (const brand of [...ADAPTER_BRANDS, ...RUNTIME_BRANDS]) {
      expect(brand.path.length, brand.name).toBeGreaterThan(20)
      expect(brand.hex, brand.name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
