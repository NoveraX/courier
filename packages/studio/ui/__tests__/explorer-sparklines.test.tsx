/**
 * @vitest-environment jsdom
 */
/**
 * The Explorer's sparklines run forward in time and its endpoint panel lists
 * the latest calls. The store holds the newest request first, which drew
 * a recovery as a decline and listed the oldest 50 calls as the "recent" ones.
 */
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import type { RequestEntry } from "@/store"
import { useStudioStore } from "@/store"
import { computeOverviewKPIs } from "@/views/explorer/overview/compute-overview"
import { useEndpointMetrics } from "@/views/explorer/use-endpoint-metrics"

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

/** 60 failures, then 60 successes — held newest first, as the store holds them. */
function recovery(): RequestEntry[] {
  return Array.from({ length: 120 }, (_, i) => request(i, i < 60 ? "error" : "success")).reverse()
}

beforeEach(() => {
  useStudioStore.setState({ requests: recovery() })
})

describe("the Explorer after a recovery", () => {
  it("draws the overall health rising", () => {
    const kpis = computeOverviewKPIs([], [], [], recovery())

    expect(kpis.healthSparkline[0]?.value).toBe(0)
    expect(kpis.healthSparkline.at(-1)?.value).toBe(100)
  })

  it("draws the endpoint's success rate rising", () => {
    const { result } = renderHook(() => useEndpointMetrics("api", "users", "list"))

    expect(result.current.successRateSparkline[0]?.value).toBe(0)
    expect(result.current.successRateSparkline.at(-1)?.value).toBe(100)
  })

  it("lists the endpoint's latest calls, newest first", () => {
    const { result } = renderHook(() => useEndpointMetrics("api", "users", "list"))

    expect(result.current.recentRequests[0]?.id).toBe("r119")
    expect(result.current.recentRequests.at(-1)?.id).toBe("r70")
  })
})
