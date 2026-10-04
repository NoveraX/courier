import type { RequestEntry } from "@/store/types";
import type { SparklinePoint } from "./types";

// ── Percentile ───────────────────────────────────────────────────────────────

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ── Sparkline extraction ─────────────────────────────────────────────────────

/**
 * Groups requests into `bucketCount` equal-size buckets and applies
 * `extract` to each bucket to produce a sparkline data series.
 */
export function extractSparkline(
  requests: RequestEntry[],
  bucketCount: number,
  extract: (bucket: RequestEntry[]) => number,
): SparklinePoint[] {
  if (requests.length < 2) return [];

  const size = Math.max(1, Math.floor(requests.length / bucketCount));
  const points: SparklinePoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * size;
    const end = i === bucketCount - 1 ? requests.length : start + size;
    const bucket = requests.slice(start, end);
    if (bucket.length === 0) break;
    points.push({ value: extract(bucket) });
  }

  return points;
}
