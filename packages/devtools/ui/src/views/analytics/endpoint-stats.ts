import type { RequestEntry } from "../../store"
import { percentile } from "./kpi-helpers"

export interface EndpointStats {
  label: string
  calls: number
  p50: number
  p95: number
  p99: number
  avgSize: number
  errorRate: number
}

export function computeEndpointStats(requests: RequestEntry[]): EndpointStats[] {
  const map = new Map<string, RequestEntry[]>()

  for (const r of requests) {
    if (r.status === "pending") continue
    const label = [r.source, r.group, r.method].filter(Boolean).join(".")
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(r)
  }

  return Array.from(map, ([label, entries]) => {
    const durations = entries.filter((r) => r.timing).map((r) => r.timing!.total).sort((a, b) => a - b)
    const errors = entries.filter((r) => r.status === "error" || r.status === "validation_error").length
    const totalSize = entries.reduce((s, r) => s + (r.size ?? 0), 0)

    return {
      label, calls: entries.length,
      p50: percentile(durations, 50), p95: percentile(durations, 95), p99: percentile(durations, 99),
      avgSize: entries.length > 0 ? totalSize / entries.length : 0,
      errorRate: entries.length > 0 ? (errors / entries.length) * 100 : 0,
    }
  }).sort((a, b) => b.p95 - a.p95)
}
