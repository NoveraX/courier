import { useMemo } from "react";
import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { formatDuration, formatSize, formatNumber } from "@/components/shared/formatters";
import { useStudioStore } from "@/store";

import { computeKPIs } from "./compute-kpis";
import { computeHistogram } from "./compute-histogram";
import { computeStatusBreakdown } from "./compute-status";
import { computeTimeSeries } from "./compute-time-series";
import { computeEndpointStats } from "./compute-endpoints";
import { successRateColor, durationColor } from "./constants";
import { KPICard } from "./kpi-card";
import { ResponseTimeChart } from "./response-time-chart";
import { StatusChart } from "./status-chart";
import { RequestsOverTimeChart } from "./requests-over-time";
import { EndpointsTable } from "./endpoints-table";

// ── Analytics View ───────────────────────────────────────────────────────────

export function AnalyticsView(): React.ReactElement {
  const requests = useStudioStore((s) => s.requests);

  const completed = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );

  const kpis = useMemo(() => computeKPIs(requests), [requests]);
  const histogram = useMemo(() => computeHistogram(requests), [requests]);
  const statusBreakdown = useMemo(() => computeStatusBreakdown(requests), [requests]);
  const timeSeries = useMemo(() => computeTimeSeries(requests), [requests]);
  const endpoints = useMemo(() => computeEndpointStats(requests), [requests]);

  if (completed.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={BarChart3}
          heading="No analytics data yet"
          description="Analytics will appear as requests complete. Start making API calls from your app."
        />
      </div>
    );
  }

  return (
    <PageShell>
      <div className="space-y-5 p-5">
        <KPIGrid kpis={kpis} />
        <ChartGrid
          histogram={histogram}
          statusBreakdown={statusBreakdown}
          statusTotal={completed.length}
          timeSeries={timeSeries}
        />
        <ChartPanel title="Top Endpoints">
          <EndpointsTable data={endpoints} requests={requests} />
        </ChartPanel>
      </div>
    </PageShell>
  );
}

// ── KPI Grid ─────────────────────────────────────────────────────────────────

function KPIGrid({ kpis }: { kpis: ReturnType<typeof computeKPIs> }): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KPICard label="Total Requests" value={kpis.totalRequests} format={formatNumber} sparkline={kpis.totalRequestsSparkline} sparklineColor="var(--chart-4)" />
      <KPICard label="Success Rate" value={kpis.successRate} format={fmtPercent} color={successRateColor(kpis.successRate)} trend={kpis.successRateTrend} sparkline={kpis.successRateSparkline} sparklineColor="var(--chart-2)" />
      <KPICard label="P95 Latency" value={kpis.p95ResponseTime} format={formatDuration} color={durationColor(kpis.p95ResponseTime)} trend={kpis.p95Trend} invertTrend sparkline={kpis.p95Sparkline} sparklineColor="var(--chart-1)" />
      <KPICard label="Errors" value={kpis.errorCount} format={fmtInt} color={kpis.errorCount === 0 ? "text-emerald-400" : "text-rose-400"} trend={kpis.errorTrend} invertTrend sparkline={kpis.errorSparkline} sparklineColor="var(--chart-7)" />
      <KPICard label="Throughput" value={kpis.throughput} format={fmtThroughput} sparkline={kpis.throughputSparkline} sparklineColor="var(--chart-4)" />
      <KPICard label="Avg Size" value={kpis.avgSize} format={formatSize} sparkline={kpis.avgSizeSparkline} sparklineColor="var(--chart-5)" />
    </div>
  );
}

// ── Chart Grid ───────────────────────────────────────────────────────────────

function ChartGrid({ histogram, statusBreakdown, statusTotal, timeSeries }: {
  histogram: ReturnType<typeof computeHistogram>;
  statusBreakdown: ReturnType<typeof computeStatusBreakdown>;
  statusTotal: number;
  timeSeries: ReturnType<typeof computeTimeSeries>;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ChartPanel title="Response Time Distribution">
        <ResponseTimeChart data={histogram} />
      </ChartPanel>
      <ChartPanel title="Status Breakdown">
        <StatusChart data={statusBreakdown} total={statusTotal} />
      </ChartPanel>
      <ChartPanel title="Requests Over Time">
        <RequestsOverTimeChart data={timeSeries} />
      </ChartPanel>
    </div>
  );
}

// ── Chart Panel ──────────────────────────────────────────────────────────────

function ChartPanel({ title, children }: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <h4 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtThroughput(n: number): string {
  return `${n.toFixed(1)}/min`;
}
