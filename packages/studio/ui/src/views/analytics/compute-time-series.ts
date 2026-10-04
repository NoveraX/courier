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
  const sorted = [...requests].sort((a, b) => a.startedAt - b.startedAt);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return [];
  const bucketSize = pickBucketSize(last.startedAt - first.startedAt);
  const start = first.startedAt;

  const buckets = new Map<number, TimeSeriesBucket>();

  for (const r of sorted) {
    const key = Math.floor((r.startedAt - start) / bucketSize) * bucketSize + start;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label: formatBucketLabel(key), success: 0, error: 0, pending: 0 };
      buckets.set(key, bucket);
    }

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
