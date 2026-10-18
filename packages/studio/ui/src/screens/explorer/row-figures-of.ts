import type { EndpointNode } from "@/features/explorer/explorer-model";
import { formatDuration } from "@/lib/formatters";

/** A figure in an endpoint's row: what it says, and the colour it says it in. */
export interface RowFigure {
  text: string;
  className: string;
}

/**
 * The p95 and the error rate an endpoint's row in the Endpoints list shows:
 * the p95 amber past the slow threshold and red past twice it, `stream` for
 * a called stream, `—` with nothing measured; the share of its requests
 * that failed amber from 5% and red from 20%, `—` before any request.
 *
 * @param e - The endpoint
 * @param slowMs - The slow threshold, in milliseconds
 * @returns Its p95 and error rate
 * @example
 * ```ts
 * rowFiguresOf(endpoint, 500).p95; // { text: "1.20s", className: "text-err" }
 * ```
 */
export function rowFiguresOf(
  e: EndpointNode,
  slowMs: number,
): { p95: RowFigure; errors: RowFigure } {
  return { p95: p95Of(e, slowMs), errors: errorsOf(e) };
}

function p95Of(e: EndpointNode, slowMs: number): RowFigure {
  const { p95, calls } = e.metrics;
  if (p95 === null) {
    return { text: e.transport !== "http" && calls ? "stream" : "—", className: "text-fg-subtle" };
  }
  const className = p95 > slowMs * 2 ? "text-err" : p95 > slowMs ? "text-warn" : "text-fg";
  return { text: formatDuration(p95), className };
}

function errorsOf(e: EndpointNode): RowFigure {
  const { requests, errorRate } = e.metrics;
  if (!requests) return { text: "—", className: "text-fg-subtle" };
  const className = errorRate >= 20 ? "text-err" : errorRate >= 5 ? "text-warn" : "text-fg-subtle";
  return { text: `${errorRate.toFixed(1)}%`, className };
}
