import { useMemo } from "react";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { computeNodeMetrics } from "./compute-metrics";
import { filterRequests } from "./helpers";
import type { NodeMetrics } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SparklinePoint {
  value: number;
}

export interface EndpointDetail {
  metrics: NodeMetrics;
  recentRequests: RequestEntry[];
  latencySparkline: SparklinePoint[];
  successRateSparkline: SparklinePoint[];
  p50: number;
  p99: number;
}

// ── Hook ────────────────────────────────────────────────────────────────────

const SPARKLINE_BUCKETS = 12;
const RECENT_LIMIT = 50;

export function useEndpointMetrics(source: string, group: string, method: string): EndpointDetail {
  const requests = useStudioStore((s) => s.requests);

  return useMemo(() => {
    const filtered = filterRequests(requests, source, group, method);
    /* The store holds the newest request first: its head is the latest
       calls, and the sparklines read it reversed to run forward in time. */
    const completed = filtered
      .filter((r) => r.status !== "pending")
      .sort((a, b) => a.startedAt - b.startedAt);
    const durations = extractDurations(completed);

    return {
      metrics: computeNodeMetrics(filtered),
      recentRequests: filtered.slice(0, RECENT_LIMIT),
      latencySparkline: buildSparkline(completed, bucketAvgLatency),
      successRateSparkline: buildSparkline(completed, bucketSuccessRate),
      p50: percentile(durations, 50),
      p99: percentile(durations, 99),
    };
  }, [requests, source, group, method]);
}

// ── Sparkline builder ───────────────────────────────────────────────────────

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

// ── Bucket extractors ───────────────────────────────────────────────────────

function bucketAvgLatency(bucket: RequestEntry[]): number {
  const durations = extractDurations(bucket);
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function bucketSuccessRate(bucket: RequestEntry[]): number {
  const successes = bucket.filter((r) => r.status === "success").length;
  return (successes / (bucket.length || 1)) * 100;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function extractDurations(requests: RequestEntry[]): number[] {
  return requests
    .filter((r) => r.timing)
    .map((r) => r.timing!.total)
    .sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}
