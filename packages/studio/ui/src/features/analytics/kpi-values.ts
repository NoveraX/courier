import type { Tone } from "@/design/tone";
import { percentile } from "@/features/requests/percentile";
import { formatDuration, formatSize } from "@/lib/formatters";
import type { AnalyticsRange } from "./analytics-search";
import type { AnalyticsWindow } from "./analytics-window";
import { averageSize, durationsOf, isFailure, successRate, totalSize } from "./call-stats";
import { durationLabel } from "./duration-label";
import { latencyHealth, successHealth } from "./health";

/** Analytics' headline figures, by name. */
export type KpiKey = "total" | "success" | "p95" | "errors" | "throughput" | "size";

/** The colour a figure's sparkline is drawn in. */
export type SparkTone = "brand" | "ok" | "warn" | "err" | "type";

/** What a headline figure shows: its value, its colours and a line of context. */
export interface KpiValue {
  key: KpiKey;
  label: string;
  value: string;
  tone: Tone;
  sparkTone: SparkTone;
  sub: string;
}

const RANGE_PHRASE: Readonly<Record<AnalyticsRange, string>> = {
  "1m": "last minute",
  "5m": "last 5 minutes",
  session: "this session",
};

function latency(win: AnalyticsWindow, slowMs: number): KpiValue {
  const durations = durationsOf(win.done);
  const p95 = percentile(durations, 0.95);
  const at = (fraction: number) => durationLabel(percentile(durations, fraction));
  return {
    key: "p95",
    label: "P95 latency",
    value: durationLabel(p95),
    tone: p95 === null ? "muted" : latencyHealth(p95, slowMs),
    sparkTone: "warn",
    sub: `p50 ${at(0.5)} · p99 ${at(0.99)}`,
  };
}

function success(win: AnalyticsWindow): KpiValue {
  const rate = successRate(win.done) ?? 0;
  return {
    key: "success",
    label: "Success rate",
    value: `${rate.toFixed(1)}%`,
    tone: successHealth(rate),
    sparkTone: "ok",
    sub: `${win.done.filter((r) => r.status === "success").length} succeeded`,
  };
}

function errors(win: AnalyticsWindow): KpiValue {
  const failed = win.done.filter(isFailure).length;
  const share = win.done.length === 0 ? 0 : (failed / win.done.length) * 100;
  return {
    key: "errors",
    label: "Errors",
    value: String(failed),
    tone: failed > 0 ? "err" : "ok",
    sparkTone: "err",
    sub: `${share.toFixed(1)}% of requests`,
  };
}

function size(win: AnalyticsWindow): KpiValue {
  return {
    key: "size",
    label: "Avg size",
    value: formatSize(Math.round(averageSize(win.done) ?? 0)),
    tone: "normal",
    sparkTone: "type",
    sub: `${formatSize(totalSize(win.done))} transferred`,
  };
}

/**
 * What each of Analytics' headline figures shows for a window: the value,
 * the colour it reads in — latency against the slow threshold, the success
 * rate from 95% and 80% — and its line of context.
 *
 * @param win - The window
 * @param range - The range it covers, for the total's context line
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures, by name
 * @example
 * ```ts
 * kpiValues(win, "session", 500).p95.value; // "570ms"
 * ```
 */
export function kpiValues(
  win: AnalyticsWindow,
  range: AnalyticsRange,
  slowMs: number,
): Record<KpiKey, KpiValue> {
  const calls = String(win.done.length);
  const perMinute = win.done.length / (win.span / 60_000);
  return {
    total: {
      key: "total",
      label: "Total requests",
      value: calls,
      tone: "normal",
      sparkTone: "brand",
      sub: RANGE_PHRASE[range],
    },
    success: success(win),
    p95: latency(win, slowMs),
    errors: errors(win),
    throughput: {
      key: "throughput",
      label: "Throughput",
      value: `${perMinute.toFixed(1)}/min`,
      tone: "normal",
      sparkTone: "brand",
      sub: `over ${formatDuration(win.span)}`,
    },
    size: size(win),
  };
}
