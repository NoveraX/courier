import type { RequestEntry } from "@/store/types";
import type { HistogramBucket } from "./types";

const BUCKETS = [
  { label: "<50ms", range: "0 – 50 ms", min: 0, max: 50 },
  { label: "50–100", range: "50 – 100 ms", min: 50, max: 100 },
  { label: "100–200", range: "100 – 200 ms", min: 100, max: 200 },
  { label: "200–500", range: "200 – 500 ms", min: 200, max: 500 },
  { label: "500ms–1s", range: "500 ms – 1 s", min: 500, max: 1000 },
  { label: ">1s", range: "> 1 second", min: 1000, max: Infinity },
] as const;

export function computeHistogram(requests: RequestEntry[]): HistogramBucket[] {
  const counts = BUCKETS.map((b) => ({
    label: b.label,
    range: b.range,
    success: 0,
    error: 0,
  }));

  for (const r of requests) {
    if (!r.timing || r.status === "pending") continue;
    const t = r.timing.total;
    const isError = r.status === "error" || r.status === "validation_error";

    const count = counts[BUCKETS.findIndex((b) => t >= b.min && t < b.max)];
    if (count === undefined) continue;
    if (isError) count.error++;
    else count.success++;
  }

  return counts;
}
