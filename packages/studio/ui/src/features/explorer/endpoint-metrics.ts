import { percentile } from "@/features/requests/percentile";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";

/* An endpoint called within this long, or streaming, counts as active now. */
export const ACTIVE_MS = 6_000;

/** What an endpoint's calls add up to. */
export interface EndpointMetrics {
  calls: number;
  p50: number | null;
  p95: number | null;
  /** The share of calls that failed, 0–100. */
  errorRate: number;
  errors: number;
  perMinute: number;
  avgSize: number;
  last: number | undefined;
  active: boolean;
}

/** How an endpoint, group or source is doing. */
export type HealthLevel = "healthy" | "degraded" | "critical" | "idle";

/** The tones a level is coloured in. */
export type LevelTone = "ok" | "warn" | "err" | "muted";

/** Each level, as the legend names and colours it. */
export const LEVEL_META: Readonly<Record<HealthLevel, { label: string; tone: LevelTone }>> = {
  healthy: { label: "Healthy", tone: "ok" },
  degraded: { label: "Degraded", tone: "warn" },
  critical: { label: "Critical", tone: "err" },
  idle: { label: "No traffic", tone: "muted" },
};

/**
 * What a set of calls adds up to: how many finished — a stream counts once
 * it opens — their median and p95 durations, the share that failed, how
 * many a minute since the session began, their average size, the last
 * call, and whether it is active now.
 *
 * @param requests - The calls
 * @param now - The time now
 * @param since - When the session's first call was made
 * @returns The metrics
 * @example
 * ```ts
 * metricsOf(requests, Date.now(), sessionStart).p95; // 196
 * ```
 */
export function metricsOf(
  requests: readonly RequestEntry[],
  now: number,
  since: number,
): EndpointMetrics {
  const done = requests.filter((r) => isStreamRequest(r) || requestStateOf(r) !== "pending");
  const http = done.filter((r) => !isStreamRequest(r) && requestStateOf(r) !== "aborted");
  const durations = http.flatMap((r) => (r.timing ? [r.timing.total] : []));
  const errors = done.filter((r) => isFailedState(requestStateOf(r))).length;
  const sized = http.filter((r) => r.size !== undefined);
  const last = requests.reduce<number | undefined>(
    (top, r) => (top === undefined || r.startedAt > top ? r.startedAt : top),
    undefined,
  );
  return {
    calls: done.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    errorRate: done.length ? (errors / done.length) * 100 : 0,
    errors,
    perMinute: done.length / Math.max(1, (now - since) / 60_000),
    avgSize: sized.length ? sized.reduce((sum, r) => sum + (r.size ?? 0), 0) / sized.length : 0,
    last,
    active:
      (last !== undefined && now - last < ACTIVE_MS) ||
      requests.some((r) => requestStateOf(r) === "streaming"),
  };
}

/**
 * How an endpoint is doing: no traffic without calls; critical when a
 * fifth of its calls failed or its p95 passed twice the slow threshold;
 * degraded at one in twenty or past the threshold; healthy otherwise.
 *
 * @param m - Its metrics
 * @param slowMs - Studio's slow-request threshold
 * @returns Its level
 * @example
 * ```ts
 * levelOf(metrics, 500); // "degraded"
 * ```
 */
export function levelOf(m: EndpointMetrics, slowMs: number): HealthLevel {
  if (m.calls === 0) return "idle";
  const p95 = m.p95 ?? 0;
  if (m.errorRate >= 20 || p95 > slowMs * 2) return "critical";
  if (m.errorRate >= 5 || p95 > slowMs) return "degraded";
  return "healthy";
}
