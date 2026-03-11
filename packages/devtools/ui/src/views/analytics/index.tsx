import { useMemo } from "react"

import { useDevToolsStore } from "../../store"
import { formatDuration, formatSize, DisconnectedBanner } from "../../components/ui"
import { TIMING_SLOW_MS } from "../timeline/constants"

import { computeKPIs, computeHistogram, computeStatusBreakdown, computeEndpointStats } from "./helpers"
import { KPICard } from "./kpi-card"

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_ENDPOINTS_SHOWN = 15
const SUCCESS_RATE_GOOD = 95
const SUCCESS_RATE_WARN = 80
const RESPONSE_TIME_GOOD_MS = 200
const CACHE_HIT_GOOD = 50
const ERROR_RATE_WARN = 10

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
        <KPICard label="Success Rate" value={`${kpis.successRate.toFixed(1)}%`} color={kpis.successRate >= SUCCESS_RATE_GOOD ? "text-emerald-400" : kpis.successRate >= SUCCESS_RATE_WARN ? "text-amber-400" : "text-red-400"} />
        <KPICard label="Avg Response" value={formatDuration(kpis.avgResponseTime)} trend={kpis.responseTrend} color={kpis.avgResponseTime < RESPONSE_TIME_GOOD_MS ? "text-emerald-400" : kpis.avgResponseTime < TIMING_SLOW_MS ? "text-amber-400" : "text-red-400"} />
        <KPICard label="Errors" value={String(kpis.errorCount)} trend={kpis.errorTrend} color={kpis.errorCount === 0 ? "text-emerald-400" : "text-red-400"} />
        <KPICard label="Cache Hit Rate" value={`${kpis.cacheHitRate.toFixed(0)}%`} color={kpis.cacheHitRate > CACHE_HIT_GOOD ? "text-emerald-400" : "text-text-secondary"} />
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
                      <div className="w-full rounded-t-sm bg-red-500/80" style={{ height: `${(b.errorCount / b.maxCount) * 100}%` }} />
                    )}
                    <div className={`w-full ${b.errorCount > 0 ? "" : "rounded-t-sm"} bg-emerald-500/80`} style={{ height: `${(b.successCount / b.maxCount) * 100}%` }} />
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
          <div className="mb-3 flex h-6 overflow-hidden rounded">
            {statusBreakdown.map((s) => (
              <div key={s.code} className={`${s.color} transition-all`} style={{ width: `${s.percent}%` }} title={`${s.code}: ${s.count} (${s.percent.toFixed(1)}%)`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {statusBreakdown.map((s) => (
              <div key={s.code} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
                <span className="text-[10px] text-text-secondary">{s.code}: {s.count} ({s.percent.toFixed(0)}%)</span>
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
