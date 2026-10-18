import type { Tone } from "@/design/tone";
import { formatDuration } from "@/lib/formatters";
import type { EndpointMetrics } from "./endpoint-metrics";

/** One of the figures a graph node shows on hover. */
export interface NodeFigure {
  label: string;
  value: string;
  tone: Tone;
}

function durationFigure(label: string, ms: number | null, slowMs: number): NodeFigure {
  if (ms === null) return { label, value: "—", tone: "muted" };
  return {
    label,
    value: formatDuration(ms),
    tone: ms > slowMs * 2 ? "err" : ms > slowMs ? "warn" : "ok",
  };
}

/**
 * What a node's calls add up to, as its card shows on hover: requests a
 * minute, the median and p95 durations, and the share of requests that
 * failed — or nothing while it has had no calls.
 *
 * @param m - The node's metrics
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures
 * @example
 * ```ts
 * nodeFiguresOf(metrics, 500).map((f) => f.label); // ["Requests", "p50", "p95", "Errors"]
 * ```
 */
export function nodeFiguresOf(m: EndpointMetrics, slowMs: number): NodeFigure[] {
  if (!m.calls) return [];
  return [
    { label: "Requests", value: `${m.perMinute.toFixed(1)}/m`, tone: "normal" },
    durationFigure("p50", m.p50, slowMs),
    durationFigure("p95", m.p95, slowMs),
    errorsFigure(m),
  ];
}

/* The share of requests that failed; none sent, where other calls' requests answered every read. */
function errorsFigure(m: EndpointMetrics): NodeFigure {
  if (!m.requests) return { label: "Errors", value: "—", tone: "muted" };
  return {
    label: "Errors",
    value: `${m.errorRate.toFixed(1)}%`,
    tone: m.errorRate >= 20 ? "err" : m.errorRate >= 5 ? "warn" : "ok",
  };
}
