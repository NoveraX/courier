import { useMemo } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

import type { RequestEntry } from "../../store"
import { useDevToolsStore } from "../../store"
import { formatDuration, formatSize, DisconnectedBanner } from "../../components/ui"
import { TIMING_SLOW_MS } from "../timeline/constants"

// ── Constants ───────────────────────────────────────────────────────────────

const TREND_THRESHOLD = 0.1
const RECENT_WINDOW = 10
const MAX_ENDPOINTS_SHOWN = 15
const SUCCESS_RATE_GOOD = 95
const SUCCESS_RATE_WARN = 80
const RESPONSE_TIME_GOOD_MS = 200
const CACHE_HIT_GOOD = 50
const ERROR_RATE_WARN = 10

// ── Helpers ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]!
}

function trend(recent: number, overall: number): "up" | "down" | "flat" {
  if (overall === 0) return "flat"
  const diff = (recent - overall) / overall
  if (diff > TREND_THRESHOLD) return "up"
  if (diff < -TREND_THRESHOLD) return "down"
  return "flat"
}

// ── KPI Computation ─────────────────────────────────────────────────────────

interface KPIData {
  totalRequests: number
  successRate: number
  avgResponseTime: number
  errorCount: number
  cacheHitRate: number
  avgSize: number
  responseTrend: "up" | "down" | "flat"
  errorTrend: "up" | "down" | "flat"
}

function computeKPIs(requests: RequestEntry[]): KPIData {
  const completed = requests.filter((r) => r.status !== "pending")
  const successes = completed.filter((r) => r.status === "success")
  const errors = completed.filter((r) => r.status === "error" || r.status === "validation_error")
  const withTiming = completed.filter((r) => r.timing)
  const cacheHits = completed.filter((r) => r.timing && r.timing.fetch === 0)

  const totalTiming = withTiming.reduce((sum, r) => sum + (r.timing?.total ?? 0), 0)
  const avgTime = withTiming.length > 0 ? totalTiming / withTiming.length : 0

  const totalSize = completed.reduce((sum, r) => sum + (r.size ?? 0), 0)
  const avgSize = completed.length > 0 ? totalSize / completed.length : 0

  // Trend: compare last 10 to overall
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

// ── Histogram data ──────────────────────────────────────────────────────────

interface HistogramBucket {
  label: string
  count: number
  maxCount: number
  successCount: number
  errorCount: number
}

function computeHistogram(requests: RequestEntry[]): HistogramBucket[] {
  const buckets = [
    { label: "<50ms", min: 0, max: 50 },
    { label: "50-100", min: 50, max: 100 },
    { label: "100-200", min: 100, max: 200 },
    { label: "200-500", min: 200, max: 500 },
    { label: "500ms-1s", min: 500, max: 1000 },
    { label: ">1s", min: 1000, max: Infinity },
  ]

  const counts = buckets.map((b) => ({
    label: b.label,
    count: 0,
    successCount: 0,
    errorCount: 0,
    maxCount: 0,
  }))

  for (const r of requests) {
    if (!r.timing || r.status === "pending") continue
    const t = r.timing.total
    for (let i = 0; i < buckets.length; i++) {
      if (t >= buckets[i]!.min && t < buckets[i]!.max) {
        counts[i]!.count++
        if (r.status === "success") counts[i]!.successCount++
        else counts[i]!.errorCount++
        break
      }
    }
  }

  const max = Math.max(1, ...counts.map((c) => c.count))
  for (const c of counts) c.maxCount = max

  return counts
}

// ── Status breakdown ────────────────────────────────────────────────────────

interface StatusSlice {
  code: string
  count: number
  color: string
  percent: number
}

function computeStatusBreakdown(requests: RequestEntry[]): StatusSlice[] {
  const completed = requests.filter((r) => r.status !== "pending")
  const map = new Map<string, number>()

  for (const r of completed) {
    const code = r.statusCode ? `${Math.floor(r.statusCode / 100)}xx` : (r.status === "error" ? "Error" : "Other")
    map.set(code, (map.get(code) ?? 0) + 1)
  }

  const colors: Record<string, string> = {
    "2xx": "bg-emerald-500",
    "3xx": "bg-amber-500",
    "4xx": "bg-red-400",
    "5xx": "bg-red-600",
    Error: "bg-rose-500",
    Other: "bg-zinc-500",
  }

  const total = completed.length || 1
  return Array.from(map, ([code, count]) => ({
    code,
    count,
    color: colors[code] ?? "bg-zinc-500",
    percent: (count / total) * 100,
  })).sort((a, b) => b.count - a.count)
}

// ── Slowest endpoints ───────────────────────────────────────────────────────

interface EndpointStats {
  label: string
  calls: number
  p50: number
  p95: number
  p99: number
  avgSize: number
  errorRate: number
}

function computeEndpointStats(requests: RequestEntry[]): EndpointStats[] {
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
      label,
      calls: entries.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      avgSize: entries.length > 0 ? totalSize / entries.length : 0,
      errorRate: entries.length > 0 ? (errors / entries.length) * 100 : 0,
    }
  }).sort((a, b) => b.p95 - a.p95)
}

// ── Analytics View ──────────────────────────────────────────────────────────

export function AnalyticsView() {
  const { requests, connected } = useDevToolsStore()

  const kpis = useMemo(() => computeKPIs(requests), [requests])
  const histogram = useMemo(() => computeHistogram(requests), [requests])
  const statusBreakdown = useMemo(() => computeStatusBreakdown(requests), [requests])
  const endpointStats = useMemo(() => computeEndpointStats(requests), [requests])

  if (requests.filter((r) => r.status !== "pending").length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {!connected && <DisconnectedBanner />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
          <p className="text-sm">No data yet</p>
          <p className="text-xs">Analytics will populate as requests complete</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!connected && <DisconnectedBanner />}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        <KPICard label="Total Requests" value={String(kpis.totalRequests)} />
        <KPICard
          label="Success Rate"
          value={`${kpis.successRate.toFixed(1)}%`}
          color={kpis.successRate >= SUCCESS_RATE_GOOD ? "text-emerald-400" : kpis.successRate >= SUCCESS_RATE_WARN ? "text-amber-400" : "text-red-400"}
        />
        <KPICard
          label="Avg Response"
          value={formatDuration(kpis.avgResponseTime)}
          trend={kpis.responseTrend}
          color={kpis.avgResponseTime < RESPONSE_TIME_GOOD_MS ? "text-emerald-400" : kpis.avgResponseTime < TIMING_SLOW_MS ? "text-amber-400" : "text-red-400"}
        />
        <KPICard
          label="Errors"
          value={String(kpis.errorCount)}
          trend={kpis.errorTrend}
          color={kpis.errorCount === 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KPICard
          label="Cache Hit Rate"
          value={`${kpis.cacheHitRate.toFixed(0)}%`}
          color={kpis.cacheHitRate > CACHE_HIT_GOOD ? "text-emerald-400" : "text-text-secondary"}
        />
        <KPICard label="Avg Size" value={formatSize(kpis.avgSize)} />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Response Time Histogram */}
        <div className="rounded-lg border border-border-default bg-surface-0 p-3">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Response Time Distribution
          </h3>
          <div className="flex h-32 items-end gap-1">
            {histogram.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-col items-center" style={{ height: "100px" }}>
                  <div className="flex w-full flex-1 flex-col justify-end gap-px">
                    {b.errorCount > 0 && (
                      <div
                        className="w-full rounded-t-sm bg-red-500/80"
                        style={{ height: `${(b.errorCount / b.maxCount) * 100}%` }}
                      />
                    )}
                    <div
                      className={`w-full ${b.errorCount > 0 ? "" : "rounded-t-sm"} bg-emerald-500/80`}
                      style={{ height: `${(b.successCount / b.maxCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-text-muted">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="rounded-lg border border-border-default bg-surface-0 p-3">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Status Code Breakdown
          </h3>

          {/* Horizontal stacked bar */}
          <div className="mb-3 flex h-6 overflow-hidden rounded">
            {statusBreakdown.map((s) => (
              <div
                key={s.code}
                className={`${s.color} transition-all`}
                style={{ width: `${s.percent}%` }}
                title={`${s.code}: ${s.count} (${s.percent.toFixed(1)}%)`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {statusBreakdown.map((s) => (
              <div key={s.code} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
                <span className="text-[10px] text-text-secondary">
                  {s.code}: {s.count} ({s.percent.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Slowest Endpoints Table */}
      <div className="rounded-lg border border-border-default bg-surface-0 p-3">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Slowest Endpoints (by P95)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-muted">
                <th className="pb-2 pr-4 font-medium">Endpoint</th>
                <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                <th className="pb-2 pr-4 font-medium text-right">P50</th>
                <th className="pb-2 pr-4 font-medium text-right">P95</th>
                <th className="pb-2 pr-4 font-medium text-right">P99</th>
                <th className="pb-2 pr-4 font-medium text-right">Avg Size</th>
                <th className="pb-2 font-medium text-right">Error %</th>
              </tr>
            </thead>
            <tbody>
              {endpointStats.slice(0, MAX_ENDPOINTS_SHOWN).map((ep) => (
                <tr key={ep.label} className="border-b border-border-subtle">
                  <td className="py-1.5 pr-4 font-mono text-text-secondary">{ep.label}</td>
                  <td className="py-1.5 pr-4 text-right text-text-muted">{ep.calls}</td>
                  <td className="py-1.5 pr-4 text-right text-text-muted">{formatDuration(ep.p50)}</td>
                  <td className={`py-1.5 pr-4 text-right ${ep.p95 > TIMING_SLOW_MS ? "text-red-400" : ep.p95 > RESPONSE_TIME_GOOD_MS ? "text-amber-400" : "text-text-muted"}`}>
                    {formatDuration(ep.p95)}
                  </td>
                  <td className={`py-1.5 pr-4 text-right ${ep.p99 > TIMING_SLOW_MS * 2 ? "text-red-400" : "text-text-muted"}`}>
                    {formatDuration(ep.p99)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-text-muted">{formatSize(ep.avgSize)}</td>
                  <td className={`py-1.5 text-right ${ep.errorRate > ERROR_RATE_WARN ? "text-red-400" : ep.errorRate > 0 ? "text-amber-400" : "text-text-muted"}`}>
                    {ep.errorRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  color = "text-text-primary",
  trend: trendDir,
}: {
  label: string
  value: string
  color?: string
  trend?: "up" | "down" | "flat"
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`text-lg font-semibold ${color}`}>{value}</span>
        {trendDir === "up" && <TrendingUp size={12} className="text-red-400" />}
        {trendDir === "down" && <TrendingDown size={12} className="text-emerald-400" />}
        {trendDir === "flat" && <Minus size={12} className="text-text-muted" />}
      </div>
    </div>
  )
}
