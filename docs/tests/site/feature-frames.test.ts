/**
 * The landing page's feature cards run on one clock. Each demo must loop
 * cleanly and show the behaviour it stands for: an upload reaching 100 %,
 * an answer arriving word by word, a call going in and out through every
 * layer, and an address refused until it is whole.
 */
import { describe, expect, it } from "vitest"

import {
  errorsFrame,
  MIDDLEWARE_STEPS,
  middlewareFrame,
  STREAM_TOKENS,
  streamFrame,
  TYPED_EMAIL,
  validationFrame,
} from "@/site/landing/features/feature-frames"
import { UPLOAD_CYCLE, uploadFrame } from "@/site/landing/features/upload-frame"

describe("the feature demos", () => {
  it("climbs an upload to 100 % without going back, holds, then starts again", () => {
    const percents = Array.from({ length: UPLOAD_CYCLE }, (_, tick) => uploadFrame(tick).percent)

    expect(percents[0]).toBe(0)
    expect(percents.every((p, at) => at === 0 || p >= (percents[at - 1] ?? 0))).toBe(true)
    expect(uploadFrame(UPLOAD_CYCLE - 1)).toEqual({ percent: 100, speed: null })
    expect(uploadFrame(UPLOAD_CYCLE).percent).toBe(0)
  })

  it("streams one word a tick, holds the whole answer, then starts again", () => {
    expect(streamFrame(0)).toBe(0)
    expect(streamFrame(5)).toBe(5)
    expect(streamFrame(STREAM_TOKENS.length + 10)).toBe(STREAM_TOKENS.length)
    expect(streamFrame(STREAM_TOKENS.length + 22)).toBe(0)
  })

  it("takes a call through every layer and back out in reverse", () => {
    const layers = MIDDLEWARE_STEPS.map((step) => step.layer)

    expect(layers).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    expect(middlewareFrame(6 * 7)).toBe(7)
    expect(middlewareFrame(6 * 11)).toBe(0)
  })

  it("pauses on a half-typed address before finishing it", () => {
    expect(validationFrame(7)).toBe(8)
    expect(validationFrame(15)).toBe(8)
    const whole = Array.from({ length: 60 }, (_, tick) => validationFrame(tick)).indexOf(TYPED_EMAIL.length)
    expect(whole).toBeGreaterThan(19)
  })

  it("lights each step of the narrowing, the last one longest", () => {
    expect([0, 11, 22, 33, 56].map(errorsFrame)).toEqual([0, 1, 2, 3, 3])
    expect(errorsFrame(57)).toBe(0)
  })
})
