import { MetricCard } from "../metric-card";
import type { EndpointDetail } from "../../use-endpoint-metrics";
import type { NodeMetrics } from "../../types";
import { HEALTH_COLORS } from "../../constants";
import { getHealthLevel } from "../../compute-metrics";

// ── Props ────────────────────────────────────────────────────────────────────

interface OverviewTabProps {
  detail: EndpointDetail;
}

// ── Component ────────────────────────────────────────────────────────────────

export function OverviewTab({ detail }: OverviewTabProps): React.ReactElement {
  const { metrics, latencySparkline, successRateSparkline, p50, p99 } = detail;
  const hasData = metrics.totalRequests > 0;

  return (
    <div className="space-y-4">
      {/* 2x2 metric cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard
          label="Total Calls"
          value={formatCount(metrics.totalRequests)}
          sparkline={latencySparkline}
          sparklineColor="var(--chart-1)"
        />
        <MetricCard
          label="Success Rate"
          value={hasData ? formatPercent(metrics.successRate) : "—"}
          valueColor={hasData ? successRateColor(metrics) : undefined}
          sparkline={successRateSparkline}
          sparklineColor={HEALTH_COLORS[getHealthLevel(metrics)]}
        />
        <MetricCard
          label="Avg Latency"
          value={hasData ? formatMs(metrics.avgResponseTime) : "—"}
          subtitle={hasData ? `P95: ${formatMs(metrics.p95ResponseTime)}` : undefined}
          sparkline={latencySparkline}
          sparklineColor="var(--chart-3)"
        />
        <MetricCard
          label="Errors"
          value={hasData ? String(metrics.errorCount) : "—"}
          valueColor={metrics.errorCount > 0 ? "text-rose-400" : undefined}
          subtitle={hasData ? formatBytes(metrics.avgSize) + " avg size" : undefined}
        />
      </div>

      {/* Latency percentile bar — only meaningful with 3+ requests */}
      {metrics.totalRequests >= 3 && (
        <PercentileBar p50={p50} p95={metrics.p95ResponseTime} p99={p99} />
      )}
    </div>
  );
}

// ── Percentile Bar ───────────────────────────────────────────────────────────

function PercentileBar({
  p50,
  p95,
  p99,
}: {
  p50: number;
  p95: number;
  p99: number;
}): React.ReactElement {
  const hasData = p99 > 0;
  const max = Math.max(p99, 1);

  return (
    <div className="rounded-lg border border-border-subtle bg-card/60 p-3">
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Latency Distribution
      </p>

      <div className="relative h-3 w-full rounded-full bg-muted/30 overflow-hidden">
        {hasData && (
          <>
            {/* P99 (widest) on bottom, P50 (narrowest) on top */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-rose-500/40"
              style={{ width: "100%", zIndex: 1 }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-500/50"
              style={{ width: `${(p95 / max) * 100}%`, zIndex: 2 }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/70"
              style={{ width: `${(p50 / max) * 100}%`, zIndex: 3 }}
            />
          </>
        )}
      </div>

      <div className="mt-2 flex justify-between text-body-xs text-muted-foreground/60">
        <span>P50: <span className="text-emerald-400 tabular-nums">{hasData ? formatMs(p50) : "—"}</span></span>
        <span>P95: <span className="text-amber-400 tabular-nums">{hasData ? formatMs(p95) : "—"}</span></span>
        <span>P99: <span className="text-rose-400 tabular-nums">{hasData ? formatMs(p99) : "—"}</span></span>
      </div>
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function successRateColor(metrics: NodeMetrics): string | undefined {
  const level = getHealthLevel(metrics);
  if (level === "critical") return "text-rose-400";
  if (level === "degraded") return "text-amber-400";
  return "text-emerald-400";
}
