import { Activity, AlertTriangle, Timer, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import type { MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { CorrelationPanel } from "./correlation-timeline";
import { ErrorBreakdown } from "./error-breakdown";
import { LatencyHistogram } from "./latency-histogram";
import { computeNetworkStats } from "./network-utils";
import { PercentileCard, StatCard } from "./stat-cards";

interface NetworkStatsProps {
  server: MockServerInfo;
}

export function NetworkStats({ server }: NetworkStatsProps): React.ReactElement {
  const logs = useMockStore((s) => s.logs);

  const serverLogs = useMemo(
    () => logs.filter((l) => l.serverId === server.serverId).slice(0, 200),
    [logs, server.serverId],
  );
  const stats = useMemo(() => computeNetworkStats(serverLogs), [serverLogs]);
  const eventTimestamps = useMemo(() => {
    const ts: number[] = [];
    if (server.latencyStartedAt) ts.push(server.latencyStartedAt);
    if (server.chaosStartedAt) ts.push(server.chaosStartedAt);
    return ts;
  }, [server.latencyStartedAt, server.chaosStartedAt]);

  // Empty state — no requests yet
  if (stats.requestCount === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-card/50">
        <div className="text-center">
          <Activity className="mx-auto mb-3 size-8 text-muted-foreground/30" />
          <p className="text-body-sm font-medium text-muted-foreground/60">Waiting for requests</p>
          <p className="mt-1 text-body-xs text-muted-foreground/40">
            Metrics will appear as mock server handles traffic
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Percentile cards */}
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Timer className="size-3.5 text-muted-foreground/50" />
          <span className="text-caption text-muted-foreground/70">LATENCY PERCENTILES</span>
          <span className="ml-auto text-caption text-muted-foreground/40">
            {stats.requestCount} requests
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <PercentileCard label="P50" value={stats.latency.p50} />
          <PercentileCard label="P95" value={stats.latency.p95} highlight={stats.latency.p95 > 0} />
          <PercentileCard
            label="P99"
            value={stats.latency.p99}
            danger={stats.latency.p99 > stats.latency.p50 * 3 && stats.latency.p50 > 0}
          />
        </div>
        {stats.latency.p99 > stats.latency.p50 * 3 && stats.latency.p50 > 0 && (
          <p className="mt-2 text-caption text-amber-400/80">
            ⚠ P99 is {Math.round(stats.latency.p99 / stats.latency.p50)}× P50 — long-tail latency
            detected
          </p>
        )}
      </div>

      {/* Throughput + error rate row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Activity}
          label="Requests/sec"
          value={Math.round(stats.requestsPerSec * 10) / 10}
          unit="req/s"
          variant="brand"
        />
        <StatCard
          icon={AlertTriangle}
          label="Error Rate"
          value={Math.round(stats.errors.rate)}
          unit="%"
          variant={stats.errors.rate > 30 ? "danger" : stats.errors.rate > 10 ? "amber" : "emerald"}
        />
      </div>

      {/* Latency histogram */}
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="size-3.5 text-muted-foreground/50" />
          <span className="text-caption text-muted-foreground/70">LATENCY DISTRIBUTION</span>
        </div>
        <LatencyHistogram
          latencies={serverLogs.filter((l) => l.duration !== undefined).map((l) => l.duration!)}
          p50={stats.latency.p50}
          p95={stats.latency.p95}
        />
      </div>

      {/* Error breakdown — only shown when there are errors */}
      {stats.errors.total > 0 && (
        <div className="rounded-xl border border-border-subtle bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-muted-foreground/50" />
            <span className="text-caption text-muted-foreground/70">ERROR BREAKDOWN</span>
            <span className="ml-auto text-caption text-rose-400/70">
              {stats.errors.total} total
            </span>
          </div>
          <ErrorBreakdown errors={stats.errors} />
        </div>
      )}

      {/* Correlation timeline — renders only when enough data is collected */}
      {stats.timeline.length >= 3 && (
        <CorrelationPanel timeline={stats.timeline} eventTimestamps={eventTimestamps} />
      )}
    </div>
  );
}
