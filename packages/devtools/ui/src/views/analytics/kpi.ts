import type { RequestEntry } from "../../store"

const TREND_THRESHOLD = 0.1
const RECENT_WINDOW = 10

function trend(recent: number, overall: number): "up" | "down" | "flat" {
  if (overall === 0) return "flat"
  const diff = (recent - overall) / overall
  if (diff > TREND_THRESHOLD) return "up"
  if (diff < -TREND_THRESHOLD) return "down"
  return "flat"
}

export interface KPIData {
  totalRequests: number
  successRate: number
  avgResponseTime: number
  errorCount: number
  cacheHitRate: number
  avgSize: number
  responseTrend: "up" | "down" | "flat"
  errorTrend: "up" | "down" | "flat"
}

export function computeKPIs(requests: RequestEntry[]): KPIData {
  const completed = requests.filter((r) => r.status !== "pending")
  const successes = completed.filter((r) => r.status === "success")
  const errors = completed.filter((r) => r.status === "error" || r.status === "validation_error")
  const withTiming = completed.filter((r) => r.timing)
  const cacheHits = completed.filter((r) => r.timing && r.timing.fetch === 0)

  const totalTiming = withTiming.reduce((sum, r) => sum + (r.timing?.total ?? 0), 0)
  const avgTime = withTiming.length > 0 ? totalTiming / withTiming.length : 0

  const totalSize = completed.reduce((sum, r) => sum + (r.size ?? 0), 0)
  const avgSize = completed.length > 0 ? totalSize / completed.length : 0

  const recentTiming = withTiming.slice(0, RECENT_WINDOW)
  const recentAvg = recentTiming.length > 0 ? recentTiming.reduce((s, r) => s + (r.timing?.total ?? 0), 0) / recentTiming.length : 0
  const recentErrors = completed.slice(0, RECENT_WINDOW).filter((r) => r.status === "error" || r.status === "validation_error").length
  const overallErrorRate = completed.length > 0 ? errors.length / completed.length : 0
  const recentErrorRate = Math.min(RECENT_WINDOW, completed.length) > 0 ? recentErrors / Math.min(RECENT_WINDOW, completed.length) : 0

  return {
    totalRequests: completed.length,
    successRate: completed.length > 0 ? (successes.length / completed.length) * 100 : 100,
    avgResponseTime: avgTime,
    errorCount: errors.length,
    cacheHitRate: withTiming.length > 0 ? (cacheHits.length / withTiming.length) * 100 : 0,
    avgSize,
    responseTrend: trend(recentAvg, avgTime),
    errorTrend: trend(recentErrorRate, overallErrorRate),
  }
}
