import type { Tone } from "@/design/tone";
import { formatDuration, formatSize } from "@/lib/formatters";
import type { EndpointMetrics } from "./endpoint-metrics";

/** What the Explorer colours its nodes and cells by. */
export const COLOR_METRICS = ["latency", "errors", "traffic", "size"] as const;
export type ColorMetric = (typeof COLOR_METRICS)[number];

/* An average answer past this size reads as a warning. */
const LARGE_BYTES = 4_000;

/**
 * An endpoint's figure under the metric the Explorer colours by: its p95,
 * the share of calls that failed, its calls a minute, or its average size —
 * with the tone it reads in.
 *
 * @param m - Its metrics
 * @param metric - What to show
 * @param slowMs - Studio's slow-request threshold
 * @returns The figure and its tone
 * @example
 * ```ts
 * metricValue(metrics, "errors", 500); // { text: "7.7%", tone: "warn" }
 * ```
 */
export function metricValue(
  m: EndpointMetrics,
  metric: ColorMetric,
  slowMs: number,
): { text: string; tone: Tone } {
  if (metric === "errors") {
    if (!m.calls) return { text: "—", tone: "muted" };
    return {
      text: `${m.errorRate.toFixed(1)}%`,
      tone: m.errorRate >= 20 ? "err" : m.errorRate >= 5 ? "warn" : "ok",
    };
  }
  if (metric === "traffic")
    return m.calls
      ? { text: `${m.perMinute.toFixed(1)}/m`, tone: "normal" }
      : { text: "—", tone: "muted" };
  if (metric === "size") {
    if (!m.avgSize) return { text: "—", tone: "muted" };
    return {
      text: formatSize(Math.round(m.avgSize)),
      tone: m.avgSize > LARGE_BYTES ? "warn" : "normal",
    };
  }
  if (m.p95 === null)
    return m.calls ? { text: "live", tone: "brand" } : { text: "—", tone: "muted" };
  return {
    text: formatDuration(m.p95),
    tone: m.p95 > slowMs * 2 ? "err" : m.p95 > slowMs ? "warn" : "ok",
  };
}
