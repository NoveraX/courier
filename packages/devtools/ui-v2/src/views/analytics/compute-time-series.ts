import type { RequestEntry } from "@/store/types";
import type { TimeSeriesBucket } from "./types";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Groups requests into adaptive time buckets for the AreaChart.
 * Bucket size adapts to the span of data so we always get 20–60 data points.
 */
export function computeTimeSeries(requests: RequestEntry[]): TimeSeriesBucket[] {
  if (requests.length === 0) return [];

  const sorted = [...requests].sort((a, b) => a.startedAt - b.startedAt);
  const span = sorted[sorted.length - 1]!.startedAt - sorted[0]!.startedAt;
  const bucketSize = pickBucketSize(span);
  const start = sorted[0]!.startedAt;

  const buckets = new Map<number, TimeSeriesBucket>();

  for (const r of sorted) {
    const key = Math.floor((r.startedAt - start) / bucketSize) * bucketSize + start;

    if (!buckets.has(key)) {
      buckets.set(key, { label: formatBucketLabel(key), success: 0, error: 0, pending: 0 });
    }

    const bucket = buckets.get(key)!;
    if (r.status === "pending") bucket.pending++;
    else if (r.status === "error" || r.status === "validation_error") bucket.error++;
    else bucket.success++;
  }

  return Array.from(buckets.values());
}

function pickBucketSize(span: number): number {
  if (span < 2 * MINUTE) return 5 * SECOND;
  if (span < 10 * MINUTE) return 15 * SECOND;
  if (span < HOUR) return MINUTE;
  return 5 * MINUTE;
}

function formatBucketLabel(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
