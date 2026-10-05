import type { ColorMetric } from "@/features/explorer/metric-value";
import { formatDuration, formatSize } from "@/lib/formatters";

/** Each step of the heatmap's scale, good to bad — or, for traffic, few calls to many. */
export const HEAT_FILLS: Readonly<Record<"health" | "traffic", readonly string[]>> = {
  health: ["bg-ok/55", "bg-warn/55", "bg-err/55", "bg-err"],
  traffic: ["bg-brand/22", "bg-brand/42", "bg-brand/65", "bg-brand"],
};

/** What the column of totals is headed. */
export const TOTAL_LABEL: Readonly<Record<ColorMetric, string>> = {
  latency: "P95",
  errors: "Errors",
  traffic: "Calls",
  size: "Avg",
};

/**
 * A heatmap value as its cell's tooltip says it.
 *
 * @param value - The value, or `null` for a span with no calls
 * @param metric - What it measures
 * @returns The text
 * @example
 * ```ts
 * heatCellText(812, "latency"); // "812ms p95"
 * ```
 */
export function heatCellText(value: number | null, metric: ColorMetric): string {
  if (value === null) return "no calls";
  if (metric === "errors") return `${value.toFixed(0)}% errors`;
  if (metric === "traffic") return `${value} ${value === 1 ? "call" : "calls"}`;
  return metric === "size" ? formatSize(Math.round(value)) : `${formatDuration(value)} p95`;
}

/**
 * A heatmap row's figure over the whole session.
 *
 * @param value - The figure, or `null` with no calls
 * @param metric - What it measures
 * @returns The text
 * @example
 * ```ts
 * heatTotalText(7.7, "errors"); // "7.7%"
 * ```
 */
export function heatTotalText(value: number | null, metric: ColorMetric): string {
  if (value === null) return "—";
  if (metric === "errors") return `${value.toFixed(1)}%`;
  if (metric === "traffic") return String(value);
  return metric === "size" ? formatSize(Math.round(value)) : formatDuration(value);
}

/**
 * A mark on the heatmap's time axis: how long before now a span starts.
 *
 * @param msBefore - How long before now
 * @returns The mark, whole seconds
 * @example
 * ```ts
 * axisMark(221_000); // "−3m 41s"
 * ```
 */
export function axisMark(msBefore: number): string {
  return `−${formatDuration(msBefore).replace(/\.\d+s$/, "s")}`;
}
