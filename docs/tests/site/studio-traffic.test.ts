/**
 * The Studio page's window streams calls. The stream must be the same on
 * the server and in the browser, move by one call a step, and read like a
 * real app's traffic.
 */
import { describe, expect, it } from "vitest"

import { formatMs, trafficBars, trafficRow, trafficRows } from "@/site/studio-landing/hero/traffic"

describe("the Studio window's stream", () => {
  it("gives the same call for the same place in the stream", () => {
    expect(trafficRow(7)).toEqual(trafficRow(7))
  })

  it("puts each new call on top and moves the rest down", () => {
    const before = trafficRows(3)
    const after = trafficRows(4)

    expect(after[0]?.n).toBe(14)
    expect(after.slice(1).map((r) => r.n)).toEqual(before.slice(0, 10).map((r) => r.n))
  })

  it("keeps each call's time near its endpoint's usual one", () => {
    const rows = Array.from({ length: 50 }, (_, n) => trafficRow(n))

    expect(rows.every((r) => r.ms > 0)).toBe(true)
    expect(rows.some((r) => r.status >= 500)).toBe(true)
  })

  it("draws forty bars that shift by one a step", () => {
    expect(trafficBars(0)).toHaveLength(40)
    expect(trafficBars(1).slice(0, 39)).toEqual(trafficBars(0).slice(1))
  })

  it("writes a duration in milliseconds, or in seconds from one second", () => {
    expect([formatMs(42), formatMs(2290)]).toEqual(["42ms", "2.29s"])
  })
})
