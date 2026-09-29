import type { MockRequestLog } from "@/store/mock-slice";

// ── Percentiles ────────────────────────────────────────────────────────────────

export function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ── Aggregated stats ───────────────────────────────────────────────────────────

export interface LatencyStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface ErrorBreakdown {
  total: number;
  rate: number;
  by500: number;
  by502: number;
  by503: number;
  timeout: number;
  reset: number;
  other4xx: number;
  other5xx: number;
}

export interface TimelinePoint {
  timestamp: number;
  avgLatency: number;
  errorRate: number;
  /** Event annotation — set when a chaos mode change happened near this point */
  event?: string;
}

export interface NetworkStats {
  latency: LatencyStats;
  errors: ErrorBreakdown;
  requestCount: number;
  requestsPerSec: number;
  timeline: TimelinePoint[];
}

export function computeNetworkStats(logs: MockRequestLog[]): NetworkStats {
  if (logs.length === 0) return emptyStats();

  const latencies = logs
    .filter((l) => l.duration !== undefined)
    .map((l) => l.duration!)
    .sort((a, b) => a - b);

  const errors = logs.filter((l) => l.status !== undefined && l.status >= 400);

  const latency: LatencyStats = {
    avg:
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
    p50: computePercentile(latencies, 50),
    p95: computePercentile(latencies, 95),
    p99: computePercentile(latencies, 99),
  };

  const breakdown = buildErrorBreakdown(errors, logs.length);
  const timeline = buildTimeline(logs);
  const requestsPerSec = computeReqPerSec(logs);

  return { latency, errors: breakdown, requestCount: logs.length, requestsPerSec, timeline };
}

function buildErrorBreakdown(errors: MockRequestLog[], total: number): ErrorBreakdown {
  const rate = total > 0 ? (errors.length / total) * 100 : 0;
  return {
    total: errors.length,
    rate,
    by500: errors.filter((e) => e.status === 500).length,
    by502: errors.filter((e) => e.status === 502).length,
    by503: errors.filter((e) => e.status === 503).length,
    timeout: errors.filter((e) => e.status === 408 || e.error?.toLowerCase().includes("timeout"))
      .length,
    reset: errors.filter((e) => e.error?.toLowerCase().includes("reset")).length,
    other4xx: errors.filter((e) => e.status !== undefined && e.status >= 400 && e.status < 500)
      .length,
    other5xx: errors.filter(
      (e) => e.status !== undefined && e.status >= 500 && ![500, 502, 503].includes(e.status),
    ).length,
  };
}

function buildTimeline(logs: MockRequestLog[]): TimelinePoint[] {
  if (logs.length === 0) return [];
  // Group into ~60 buckets of equal count
  const bucketSize = Math.max(1, Math.floor(logs.length / 60));
  const points: TimelinePoint[] = [];
  for (let i = 0; i < logs.length; i += bucketSize) {
    const bucket = logs.slice(i, i + bucketSize);
    const lats = bucket.filter((l) => l.duration !== undefined).map((l) => l.duration!);
    const errs = bucket.filter((l) => l.status !== undefined && l.status >= 400);
    points.push({
      timestamp: bucket[0]?.timestamp ?? 0,
      avgLatency: lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0,
      errorRate: bucket.length > 0 ? (errs.length / bucket.length) * 100 : 0,
    });
  }
  return points.reverse();
}

function computeReqPerSec(logs: MockRequestLog[]): number {
  if (logs.length < 2) return 0;
  const newest = logs[0]?.timestamp ?? 0;
  const oldest = logs[logs.length - 1]?.timestamp ?? 0;
  const spanMs = newest - oldest;
  return spanMs > 0 ? Math.round((logs.length / spanMs) * 1000 * 10) / 10 : 0;
}

function emptyStats(): NetworkStats {
  return {
    latency: { avg: 0, p50: 0, p95: 0, p99: 0 },
    errors: {
      total: 0,
      rate: 0,
      by500: 0,
      by502: 0,
      by503: 0,
      timeout: 0,
      reset: 0,
      other4xx: 0,
      other5xx: 0,
    },
    requestCount: 0,
    requestsPerSec: 0,
    timeline: [],
  };
}
