import type { RequestEntry } from "@/store/types";
import { extractSparkline, percentile } from "./kpi-helpers";
import type { KPIData, TrendInfo } from "./types";

const TREND_THRESHOLD = 0.1;
const SPARKLINE_BUCKETS = 12;

/**
 * The headline figures of the Analytics view, with their trends and
 * sparklines.
 *
 * @param requests - The captured requests, in any order
 * @returns The figures; trends compare the older half of the completed
 *   requests with the newer, and sparklines run oldest to newest
 *
 * @example
 * ```ts
 * const kpis = computeKPIs(useStudioStore.getState().requests);
 * ```
 */
export function computeKPIs(requests: RequestEntry[]): KPIData {
  /* The store holds the newest request first; trends and sparklines need
     time to run forward. */
  const completed = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => a.startedAt - b.startedAt);
  const successes = completed.filter((r) => r.status === "success");
  const errors = completed.filter((r) => r.status === "error" || r.status === "validation_error");
  const durations = completed
    .filter((r) => r.timing)
    .map((r) => r.timing!.total)
    .sort((a, b) => a - b);

  const totalSize = completed.reduce((s, r) => s + (r.size ?? 0), 0);
  const spanMinutes = computeSpanMinutes(completed);

  return {
    totalRequests: completed.length,
    successRate: completed.length > 0 ? (successes.length / completed.length) * 100 : 100,
    p95ResponseTime: percentile(durations, 95),
    errorCount: errors.length,
    throughput: spanMinutes > 0 ? completed.length / spanMinutes : 0,
    avgSize: completed.length > 0 ? totalSize / completed.length : 0,
    successRateTrend: computeSuccessRateTrend(completed),
    p95Trend: computeP95Trend(completed),
    errorTrend: computeErrorTrend(completed),
    totalRequestsSparkline: extractSparkline(completed, SPARKLINE_BUCKETS, (b) => b.length),
    successRateSparkline: extractSparkline(completed, SPARKLINE_BUCKETS, bucketSuccessRate),
    p95Sparkline: extractSparkline(completed, SPARKLINE_BUCKETS, bucketP95),
    errorSparkline: extractSparkline(completed, SPARKLINE_BUCKETS, bucketErrorCount),
    throughputSparkline: extractSparkline(completed, SPARKLINE_BUCKETS, (b) => b.length),
    avgSizeSparkline: extractSparkline(completed, SPARKLINE_BUCKETS, bucketAvgSize),
  };
}

// ── Trend helpers ────────────────────────────────────────────────────────────

function computeTrend(oldVal: number, recentVal: number): TrendInfo {
  if (oldVal === 0) return { direction: "flat", percent: 0 };
  const change = (recentVal - oldVal) / oldVal;
  const percent = Math.abs(change * 100);
  if (change > TREND_THRESHOLD) return { direction: "up", percent };
  if (change < -TREND_THRESHOLD) return { direction: "down", percent };
  return { direction: "flat", percent };
}

function splitHalves(arr: RequestEntry[]): [RequestEntry[], RequestEntry[]] {
  const mid = Math.floor(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

function computeSuccessRateTrend(completed: RequestEntry[]): TrendInfo {
  if (completed.length < 4) return { direction: "flat", percent: 0 };
  const [old, recent] = splitHalves(completed);
  const oldRate = old.filter((r) => r.status === "success").length / (old.length || 1);
  const recentRate = recent.filter((r) => r.status === "success").length / (recent.length || 1);
  return computeTrend(oldRate, recentRate);
}

function computeP95Trend(completed: RequestEntry[]): TrendInfo {
  if (completed.length < 4) return { direction: "flat", percent: 0 };
  const [old, recent] = splitHalves(completed);
  const oldP95 = percentile(extractDurations(old), 95);
  const recentP95 = percentile(extractDurations(recent), 95);
  return computeTrend(oldP95, recentP95);
}

function computeErrorTrend(completed: RequestEntry[]): TrendInfo {
  if (completed.length < 4) return { direction: "flat", percent: 0 };
  const [old, recent] = splitHalves(completed);
  const isError = (r: RequestEntry): boolean =>
    r.status === "error" || r.status === "validation_error";
  const oldRate = old.filter(isError).length / (old.length || 1);
  const recentRate = recent.filter(isError).length / (recent.length || 1);
  return computeTrend(oldRate, recentRate);
}

// ── Sparkline bucket extractors ──────────────────────────────────────────────

function bucketSuccessRate(bucket: RequestEntry[]): number {
  return (bucket.filter((r) => r.status === "success").length / (bucket.length || 1)) * 100;
}

function bucketP95(bucket: RequestEntry[]): number {
  return percentile(extractDurations(bucket), 95);
}

function bucketErrorCount(bucket: RequestEntry[]): number {
  return bucket.filter((r) => r.status === "error" || r.status === "validation_error").length;
}

function bucketAvgSize(bucket: RequestEntry[]): number {
  const total = bucket.reduce((s, r) => s + (r.size ?? 0), 0);
  return bucket.length > 0 ? total / bucket.length : 0;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function extractDurations(requests: RequestEntry[]): number[] {
  return requests
    .filter((r) => r.timing)
    .map((r) => r.timing!.total)
    .sort((a, b) => a - b);
}

/**
 * Minutes spanning from earliest request start to latest request end.
 * Minimum 1-minute window to avoid burst inflation.
 */
function computeSpanMinutes(completed: RequestEntry[]): number {
  if (completed.length < 2) return 0;
  let minStart = Infinity;
  let maxEnd = 0;
  for (const r of completed) {
    if (r.startedAt < minStart) minStart = r.startedAt;
    const end = r.startedAt + (r.timing?.total ?? 0);
    if (end > maxEnd) maxEnd = end;
  }
  return Math.max(maxEnd - minStart, 60_000) / 60_000;
}
