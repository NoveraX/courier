/**
 * Trend arrows and sparklines read forward in time. The store lists requests
 * newest first; read as it stands, a recovery (failures, then successes)
 * showed a falling success rate and a rising error count.
 */
import { describe, expect, it } from "vitest"

import type { RequestEntry } from "@/store"
import { computeKPIs } from "@/views/analytics/compute-kpis"

function request(i: number, status: RequestEntry["status"]): RequestEntry {
  return {
    id: `r${i}`,
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    status,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1_000 + i * 100,
    timing: { total: 10, middleware: 0, fetch: 10, validation: 0 },
    sessionId: "s",
  }
}

/**
 * 20 requests of which the first `failing` fail, then 20 successes — held
 * newest first, as the store holds them.
 */
function recovery(failing = 20): RequestEntry[] {
  const chronological = Array.from({ length: 40 }, (_, i) => request(i, i < failing ? "error" : "success"))
  return chronological.reverse()
}

describe("analytics trends", () => {
  it("show the success rate rising and errors falling after a recovery", () => {
    const kpis = computeKPIs(recovery(15))

    expect(kpis.successRateTrend.direction).toBe("up")
    expect(kpis.errorTrend.direction).toBe("down")
  })

  it("draw the sparklines oldest to newest", () => {
    const kpis = computeKPIs(recovery())

    expect(kpis.successRateSparkline[0]?.value).toBe(0)
    expect(kpis.successRateSparkline.at(-1)?.value).toBe(100)
    expect(kpis.errorSparkline[0]?.value).toBeGreaterThan(0)
    expect(kpis.errorSparkline.at(-1)?.value).toBe(0)
  })
})
