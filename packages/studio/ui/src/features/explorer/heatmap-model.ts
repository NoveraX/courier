import { percentile } from "@/features/requests/percentile";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import type { EndpointMetrics } from "./endpoint-metrics";
import type { EndpointNode, ExplorerModel } from "./explorer-model";
import type { ColorMetric } from "./metric-value";

/** How many spans the heatmap splits the session into. */
export const HEAT_INTERVALS = 20;

export interface HeatRow {
  endpoint: EndpointNode;
  /** One value per span; `null` where it had no calls. */
  cells: (number | null)[];
  total: number | null;
}

export interface Heatmap {
  rows: HeatRow[];
  start: number;
  intervalMs: number;
}

/* The span a heatmap spans: the session so far, a minute at least. */
function spanOf(model: ExplorerModel): { start: number; intervalMs: number } {
  const span = Math.max(60_000, model.now - model.since);
  return { start: model.now - span, intervalMs: span / HEAT_INTERVALS };
}

function cellValue(calls: readonly RequestEntry[], metric: ColorMetric): number | null {
  const done = calls.filter((r) => requestStateOf(r) !== "pending");
  if (!done.length) return null;
  if (metric === "errors")
    return (done.filter((r) => isFailedState(requestStateOf(r))).length / done.length) * 100;
  if (metric === "traffic") return done.length;
  const http = done.filter((r) => !isStreamRequest(r) && requestStateOf(r) !== "aborted");
  /* The API's time is the requests': a read another call's request answered only waited for it. */
  const values = http
    .map((r) => (metric === "size" ? r.size : r.shared === undefined ? r.timing?.total : undefined))
    .filter((v): v is number => v !== undefined);
  if (!values.length) return null;
  return metric === "size"
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : percentile(values, 0.95);
}

function totalOf(m: EndpointMetrics, metric: ColorMetric): number | null {
  if (!m.calls) return null;
  if (metric === "errors") return m.errorRate;
  if (metric === "traffic") return m.calls;
  if (metric === "size") return m.avgSize || null;
  return m.p95;
}

/**
 * The heatmap: each called HTTP endpoint's calls over the session split
 * into equal spans, every span valued by the metric — its p95 duration,
 * the share that failed, how many there were, or their average size —
 * with the endpoint's figure over the whole session beside it.
 *
 * @param model - The Explorer's model
 * @param metric - What to value the spans by
 * @returns The rows and the spans
 * @example
 * ```ts
 * heatmapOf(model, "latency").rows[0]?.cells.length; // 20
 * ```
 */
export function heatmapOf(model: ExplorerModel, metric: ColorMetric): Heatmap {
  const { start, intervalMs } = spanOf(model);
  const rows = model.endpoints
    .filter((e) => e.transport === "http" && e.metrics.calls > 0)
    .map((endpoint) => ({
      endpoint,
      cells: Array.from({ length: HEAT_INTERVALS }, (_, i) => {
        const from = start + i * intervalMs;
        return cellValue(
          endpoint.requests.filter((r) => r.startedAt >= from && r.startedAt < from + intervalMs),
          metric,
        );
      }),
      total: totalOf(endpoint.metrics, metric),
    }));
  return { rows, start, intervalMs };
}

/**
 * The step on a heatmap's four-colour scale a value falls on, from good to
 * bad — or, for traffic, from few calls to many. Durations scale with the
 * slow threshold: a quarter of it, half, all of it, twice it.
 *
 * @param value - The value, or `null` for none
 * @param metric - What it measures
 * @param slowMs - Studio's slow-request threshold
 * @returns 0–3, or `null` with no value
 * @example
 * ```ts
 * heatStep(600, "latency", 500); // 2
 * ```
 */
export function heatStep(value: number | null, metric: ColorMetric, slowMs: number): number | null {
  if (value === null) return null;
  const bounds =
    metric === "errors"
      ? [10, 25, 50]
      : metric === "traffic"
        ? [2, 4, 7]
        : metric === "size"
          ? [2_500, 4_000, 5_500]
          : [slowMs * 0.5, slowMs, slowMs * 2];
  const step = bounds.findIndex((bound) => value < bound);
  return step === -1 ? 3 : step;
}
