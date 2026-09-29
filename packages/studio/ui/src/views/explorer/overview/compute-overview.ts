import type { RequestEntry } from "@/store/types";
import { getHealthLevel } from "../compute-metrics";
import type {
  EndpointNodeData,
  GroupNodeData,
  HealthLevel,
  NodeMetrics,
  SourceNodeData,
} from "../types";

// ── Shared types ────────────────────────────────────────────────────────────

export interface SparklinePoint {
  value: number;
}

// ── KPI data ────────────────────────────────────────────────────────────────

export interface OverviewKPI {
  totalSources: number;
  totalGroups: number;
  totalEndpoints: number;
  overallHealth: number;
  throughputPerMin: number;
  healthSparkline: SparklinePoint[];
  throughputSparkline: SparklinePoint[];
}

export function computeOverviewKPIs(
  sources: SourceNodeData[],
  groups: GroupNodeData[],
  endpoints: EndpointNodeData[],
  requests: RequestEntry[],
): OverviewKPI {
  /* Newest first in the store; the sparklines run forward in time. */
  const completed = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => a.startedAt - b.startedAt);
  const successes = completed.filter((r) => r.status === "success").length;
  const overallHealth = completed.length > 0 ? (successes / completed.length) * 100 : 100;

  return {
    totalSources: sources.length,
    totalGroups: groups.length,
    totalEndpoints: endpoints.length,
    overallHealth,
    throughputPerMin: computeThroughput(completed),
    healthSparkline: buildSparkline(completed, bucketSuccessRate),
    throughputSparkline: buildSparkline(completed, (b) => b.length),
  };
}

// ── Health matrix ───────────────────────────────────────────────────────────

export interface HealthMatrixCell {
  source: string;
  group: string;
  level: HealthLevel;
  metrics: NodeMetrics;
}

export function computeHealthMatrix(groups: GroupNodeData[]): HealthMatrixCell[] {
  return groups.map((g) => ({
    source: g.source,
    group: g.name,
    level: getHealthLevel(g.metrics),
    metrics: g.metrics,
  }));
}

// ── Top endpoints ───────────────────────────────────────────────────────────

export type TopMetric = "latency" | "errors" | "traffic" | "size";

export interface TopEndpointEntry {
  source: string;
  group: string;
  method: string;
  fullPath: string;
  httpMethod: string;
  endpointType: "query" | "mutation" | "untyped";
  value: number;
  successRate: number;
}

export function computeTopEndpoints(
  endpoints: EndpointNodeData[],
  metric: TopMetric,
  limit = 10,
): TopEndpointEntry[] {
  const withMetric = endpoints.filter((ep) => ep.metrics.totalRequests > 0);

  const sorted = [...withMetric].sort(
    (a, b) => extractMetricValue(b, metric) - extractMetricValue(a, metric),
  );

  return sorted.slice(0, limit).map((ep) => ({
    source: ep.source,
    group: ep.group,
    method: ep.method,
    fullPath: ep.fullPath,
    httpMethod: ep.httpMethod,
    endpointType: ep.endpointType,
    value: extractMetricValue(ep, metric),
    successRate: ep.metrics.successRate,
  }));
}

function extractMetricValue(ep: EndpointNodeData, metric: TopMetric): number {
  switch (metric) {
    case "latency":
      return ep.metrics.p95ResponseTime;
    case "errors":
      return ep.metrics.errorCount;
    case "traffic":
      return ep.metrics.totalRequests;
    case "size":
      return ep.metrics.avgSize;
  }
}

// ── Sparkline builder ───────────────────────────────────────────────────────

const SPARKLINE_BUCKETS = 12;

function buildSparkline(
  requests: RequestEntry[],
  extract: (bucket: RequestEntry[]) => number,
): SparklinePoint[] {
  if (requests.length < 2) return [];

  const size = Math.max(1, Math.floor(requests.length / SPARKLINE_BUCKETS));
  const points: SparklinePoint[] = [];

  for (let i = 0; i < SPARKLINE_BUCKETS; i++) {
    const start = i * size;
    const end = i === SPARKLINE_BUCKETS - 1 ? requests.length : start + size;
    const bucket = requests.slice(start, end);
    if (bucket.length === 0) break;
    points.push({ value: extract(bucket) });
  }

  return points;
}

function bucketSuccessRate(bucket: RequestEntry[]): number {
  const successes = bucket.filter((r) => r.status === "success").length;
  return (successes / (bucket.length || 1)) * 100;
}

// ── Throughput ───────────────────────────────────────────────────────────────

/**
 * Throughput = requests / span in minutes.
 * Span: earliest startedAt → latest (startedAt + timing.total).
 * Minimum 1-minute window to avoid burst inflation.
 * Matches analytics computeSpanMinutes logic.
 */
function computeThroughput(completed: RequestEntry[]): number {
  if (completed.length < 2) return 0;

  let minStart = Infinity;
  let maxEnd = 0;
  for (const r of completed) {
    if (r.startedAt < minStart) minStart = r.startedAt;
    const end = r.startedAt + (r.timing?.total ?? 0);
    if (end > maxEnd) maxEnd = end;
  }

  const spanMin = Math.max(maxEnd - minStart, 60_000) / 60_000;
  return completed.length / spanMin;
}
