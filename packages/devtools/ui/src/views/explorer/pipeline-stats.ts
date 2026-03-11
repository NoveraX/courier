import type { RequestEntry } from "../../store"

export interface MiddlewareStats {
  calls: number
  avgDuration: number
  errors: number
}

export interface EndpointStats {
  calls: number
  avgTotal: number
  avgFetch: number
  errorRate: number
}

export function computeEndpointStats(
  requests: RequestEntry[],
  source: string,
  group: string,
  method: string
): EndpointStats | null {
  const matching = requests.filter(
    (r) => r.source === source && r.group === group && r.method === method && r.status !== "pending"
  )
  if (matching.length === 0) return null

  const errors = matching.filter((r) => r.status === "error" || r.status === "validation_error")
  const withTiming = matching.filter((r) => r.timing)

  return {
    calls: matching.length,
    avgTotal: withTiming.length > 0
      ? withTiming.reduce((s, r) => s + (r.timing?.total ?? 0), 0) / withTiming.length
      : 0,
    avgFetch: withTiming.length > 0
      ? withTiming.reduce((s, r) => s + (r.timing?.fetch ?? 0), 0) / withTiming.length
      : 0,
    errorRate: (errors.length / matching.length) * 100,
  }
}

export function computeMiddlewareStats(
  requests: RequestEntry[],
  source: string,
  group: string,
  method: string,
  mwCount: number
): MiddlewareStats | null {
  const matching = requests.filter(
    (r) => r.source === source && r.group === group && r.method === method && r.timing
  )
  if (matching.length === 0 || mwCount === 0) return null

  const totalMwTime = matching.reduce((s, r) => s + (r.timing?.middleware ?? 0), 0)
  const errors = matching.filter((r) => r.status === "error").length

  return {
    calls: matching.length,
    avgDuration: totalMwTime / matching.length / mwCount,
    errors,
  }
}
