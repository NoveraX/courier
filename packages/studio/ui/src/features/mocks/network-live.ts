import { percentile } from "@/features/requests/percentile";
import { formatDuration } from "@/lib/formatters";
import type { MockRequestLog } from "@/store/mock-slice";
import { mockLogTone } from "./mock-log";

/* The answers the live figures read, and the spans a sparkline splits the last minute into. */
const RECENT = 60;
const SPANS = 20;
const MINUTE = 60_000;

/** A bar of a sparkline: its height against the tallest, 0–1, and its tone. */
export interface SparkBar {
  height: number;
  tone: "brand" | "ok" | "err" | "warn";
}

/** One of the Network tab's live figures, with its sparkline. */
export interface LiveFigure {
  label: string;
  value: string;
  tone: "normal" | "err" | "warn";
  spark: SparkBar[];
}

function failed(logs: readonly MockRequestLog[]): number {
  return logs.filter((log) => mockLogTone(log) !== "ok").length;
}

function durationsOf(logs: readonly MockRequestLog[]): number[] {
  return logs.flatMap((log) => (log.duration === undefined ? [] : [log.duration]));
}

function spark(
  logs: readonly MockRequestLog[],
  now: number,
  tone: SparkBar["tone"],
  read: (span: MockRequestLog[]) => number,
): SparkBar[] {
  const width = MINUTE / SPANS;
  const values = Array.from({ length: SPANS }, (_, i) => {
    const from = now - MINUTE + i * width;
    return read(logs.filter((log) => log.timestamp >= from && log.timestamp < from + width));
  });
  const top = Math.max(Number.EPSILON, ...values);
  return values.map((value) => ({ height: value / top, tone }));
}

function durationTone(ms: number | null, slowMs: number): LiveFigure["tone"] {
  if (ms === null || ms <= slowMs) return "normal";
  return ms > slowMs * 2 ? "err" : "warn";
}

/**
 * The Network tab's four live figures — answers in the last minute, the
 * error rate, the median and the p99 of the latest answers — each with a
 * sparkline of the last minute in twenty spans.
 *
 * @param logs - The server's logged requests, newest first
 * @param now - The time now
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures
 * @example
 * ```ts
 * networkLive(logs, Date.now(), 500)[0]?.value; // "139/m"
 * ```
 */
export function networkLive(
  logs: readonly MockRequestLog[],
  now: number,
  slowMs: number,
): LiveFigure[] {
  const recent = logs.slice(0, RECENT);
  const rate = recent.length ? failed(recent) / recent.length : 0;
  const p50 = percentile(durationsOf(recent), 0.5);
  const p99 = percentile(durationsOf(recent), 0.99);
  const quantile = (q: number) => (span: MockRequestLog[]) => percentile(durationsOf(span), q) ?? 0;
  return [
    {
      label: "Throughput",
      value: `${logs.filter((log) => now - log.timestamp < MINUTE).length}/m`,
      tone: "normal",
      spark: spark(logs, now, "brand", (span) => span.length),
    },
    {
      label: "Error rate",
      value: `${Math.round(rate * 100)}%`,
      tone: rate ? "err" : "normal",
      spark: spark(logs, now, "err", (span) => (span.length ? failed(span) / span.length : 0)),
    },
    {
      label: "P50",
      value: p50 === null ? "—" : formatDuration(p50),
      tone: durationTone(p50, slowMs),
      spark: spark(logs, now, "ok", quantile(0.5)),
    },
    {
      label: "P99",
      value: p99 === null ? "—" : formatDuration(p99),
      tone: durationTone(p99, slowMs),
      spark: spark(logs, now, "warn", quantile(0.99)),
    },
  ];
}
