import type { RequestEntry } from "@/store/types";

import type { EndpointImpact, OverheadLevel, SparklinePoint } from "./types";

// ── Sparkline extraction ───────────────────────────────────────────────────

const SPARKLINE_BUCKETS = 10;
const MIN_SPARKLINE_POINTS = 3;

export function extractSparkline(
  requests: RequestEntry[],
  extractor: (r: RequestEntry) => number,
): SparklinePoint[] {
  if (requests.length < MIN_SPARKLINE_POINTS) return [];
  const sorted = [...requests].sort((a, b) => a.startedAt - b.startedAt);
  const bucketSize = Math.ceil(sorted.length / SPARKLINE_BUCKETS);

  const points: SparklinePoint[] = [];
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const bucket = sorted.slice(i, i + bucketSize);
    const avg = bucket.reduce((s, r) => s + extractor(r), 0) / bucket.length;
    points.push({ value: avg });
  }
  return points;
}

export function executionSparkline(requests: RequestEntry[]): SparklinePoint[] {
  return extractSparkline(requests, () => 1);
}

export function overheadSparkline(requests: RequestEntry[]): SparklinePoint[] {
  return extractSparkline(requests, (r) => {
    const t = r.timing;
    if (!t || t.total === 0) return 0;
    return (t.middleware / t.total) * 100;
  });
}

export function p95Sparkline(requests: RequestEntry[]): SparklinePoint[] {
  return extractSparkline(requests, (r) => r.timing?.middleware ?? 0);
}

// ── Endpoint impact ────────────────────────────────────────────────────────

export function computeEndpointImpact(requests: RequestEntry[]): EndpointImpact[] {
  const map = new Map<
    string,
    {
      source: string;
      group: string;
      method: string;
      httpMethod: string;
      mwTimes: number[];
      overheads: number[];
      mwCounts: number[];
      sampleId: string;
    }
  >();

  for (const r of requests) {
    if (!r.timing || r.timing.total === 0) continue;
    const key = `${r.source}.${r.group ?? ""}.${r.method}`;
    const entry = map.get(key) ?? {
      source: r.source,
      group: r.group ?? "",
      method: r.method,
      httpMethod: r.httpMethod ?? "GET",
      mwTimes: [],
      overheads: [],
      mwCounts: [],
      sampleId: r.id,
    };
    entry.mwTimes.push(r.timing.middleware);
    entry.overheads.push((r.timing.middleware / r.timing.total) * 100);
    entry.mwCounts.push(r.middlewareEntries.length);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([key, e]) => ({
      key,
      source: e.source,
      group: e.group,
      method: e.method,
      httpMethod: e.httpMethod,
      requestCount: e.mwTimes.length,
      avgMiddlewareTime: avg(e.mwTimes),
      overheadPercent: avg(e.overheads),
      middlewareCount: Math.max(...e.mwCounts, 0),
      sampleRequestId: e.sampleId,
    }))
    .sort((a, b) => b.overheadPercent - a.overheadPercent);
}

// ── Overhead gauge level ───────────────────────────────────────────────────

export function getOverheadLevel(percent: number): OverheadLevel {
  if (percent < 5) return "good";
  if (percent < 20) return "warning";
  return "critical";
}

// ── Utilities ──────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
