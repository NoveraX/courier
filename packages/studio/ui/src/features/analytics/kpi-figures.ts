import { percentile } from "@/features/requests/percentile";
import type { RequestEntry } from "@/store/types";
import type { AnalyticsRange } from "./analytics-search";
import type { AnalyticsWindow } from "./analytics-window";
import { halvesOf, stretchesOf } from "./analytics-window";
import { averageSize, durationsOf, failureRate, isFailure, successRate } from "./call-stats";
import type { KpiKey, KpiValue } from "./kpi-values";
import { kpiValues } from "./kpi-values";
import type { SparkPath } from "./spark-path";
import { fillGaps, sparkPath } from "./spark-path";
import type { Trend } from "./trend";
import { trendOf } from "./trend";

/** One of Analytics' headline figures, with its move and its sparkline. */
export interface KpiFigure extends KpiValue {
  /** Its move since the first half of the range. */
  trend: Trend;
  spark: SparkPath;
}

type Read = (calls: RequestEntry[]) => number | null;

/** How a figure is read from calls: for its move, and for its sparkline when that differs. */
interface Reading {
  read: Read;
  spark?: Read;
  lowerIsBetter?: boolean;
}

/* How many stretches of time a figure's sparkline is drawn from. */
const SPARK_STRETCHES = 12;

const count: Read = (calls) => calls.length;

/* The error figure moves by the share of calls that failed, so more traffic
   alone does not read as a regression; its sparkline counts the failures. */
const READINGS: Readonly<Record<KpiKey, Reading>> = {
  total: { read: count },
  success: { read: successRate },
  p95: { read: (calls) => percentile(durationsOf(calls), 0.95), lowerIsBetter: true },
  errors: {
    read: failureRate,
    spark: (calls) => calls.filter(isFailure).length,
    lowerIsBetter: true,
  },
  throughput: { read: count },
  size: { read: averageSize, lowerIsBetter: true },
};

const ORDER: readonly KpiKey[] = ["total", "success", "p95", "errors", "throughput", "size"];

/**
 * Analytics' six headline figures for a window — total calls, success
 * rate, p95 latency, errors, throughput and response size — each with its
 * move from the first half of the range to the second and a sparkline
 * across it.
 *
 * @param win - The window
 * @param range - The range it covers
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures, in the order shown
 * @example
 * ```ts
 * kpiFigures(win, "session", 500)[2]?.trend.label; // "9%"
 * ```
 */
export function kpiFigures(
  win: AnalyticsWindow,
  range: AnalyticsRange,
  slowMs: number,
): KpiFigure[] {
  const values = kpiValues(win, range, slowMs);
  const [before, after] = halvesOf(win);
  return ORDER.map((key) => {
    const { read, spark = read, lowerIsBetter = false } = READINGS[key];
    return {
      ...values[key],
      trend: trendOf(read(before), read(after), lowerIsBetter),
      spark: sparkPath(fillGaps(stretchesOf(win, SPARK_STRETCHES, spark))),
    };
  });
}
