import { percentile } from "@/features/requests/percentile";
import type { RequestEntry } from "@/store/types";
import { isFailure } from "./call-stats";

/** One bar of the response-time distribution. */
export interface LatencyBin {
  /** Its upper edge, as the axis names it: `50ms`, `1s`, `2s+`. */
  label: string;
  /** The times it holds, in words: `300–500 ms`. */
  range: string;
  count: number;
  failed: number;
  /** Bars past the slow threshold read as warnings, past twice it as errors. */
  tone: "brand" | "warn" | "err";
  /** The percentiles that fall in it. */
  tags: ("p50" | "p95")[];
}

/** The distribution of response times, with its median and p95. */
export interface LatencyBins {
  bins: LatencyBin[];
  p50: number | null;
  p95: number | null;
}

/* Bin edges, ms; the last bin holds everything past two seconds. */
const EDGES = [0, 50, 100, 200, 300, 500, 1000, 2000, Number.POSITIVE_INFINITY] as const;
const LABELS = ["50ms", "100", "200", "300", "500", "1s", "2s", "2s+"] as const;
const RANGES = [
  "under 50 ms",
  "50–100 ms",
  "100–200 ms",
  "200–300 ms",
  "300–500 ms",
  "0.5–1 s",
  "1–2 s",
  "over 2 s",
] as const;

function binOf(ms: number): number {
  return EDGES.findIndex((edge, i) => ms >= edge && ms < (EDGES[i + 1] ?? edge));
}

function toneOf(upper: number, slowMs: number): LatencyBin["tone"] {
  if (upper > slowMs * 2) return "err";
  return upper > slowMs ? "warn" : "brand";
}

/**
 * How the calls' response times spread over fixed bins, each split into
 * the calls that failed and the rest, the bins the median and p95 fall in
 * tagged. Calls cut short are left out.
 *
 * @param done - The finished calls
 * @param slowMs - Studio's slow-request threshold
 * @returns The bins, fastest first, and the two percentiles
 * @example
 * ```ts
 * latencyBins(win.done, 500).bins[0]; // { label: "50ms", count: 82, failed: 3, … }
 * ```
 */
export function latencyBins(done: readonly RequestEntry[], slowMs: number): LatencyBins {
  const bins: LatencyBin[] = LABELS.map((label, i) => ({
    label,
    range: RANGES[i] ?? label,
    count: 0,
    failed: 0,
    tone: toneOf(EDGES[i + 1] ?? Number.POSITIVE_INFINITY, slowMs),
    tags: [],
  }));
  const durations: number[] = [];
  for (const r of done) {
    /* The API's time is the requests': a read another call's request answered only waited for it. */
    if (r.status === "aborted" || r.timing === undefined || r.shared !== undefined) continue;
    durations.push(r.timing.total);
    const bin = bins[binOf(r.timing.total)];
    if (!bin) continue;
    bin.count++;
    if (isFailure(r)) bin.failed++;
  }
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  if (p50 !== null) bins[binOf(p50)]?.tags.push("p50");
  if (p95 !== null) bins[binOf(p95)]?.tags.push("p95");
  return { bins, p50, p95 };
}
