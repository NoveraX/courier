import { ownRequests } from "@/features/requests/own-requests";
import { percentile } from "@/features/requests/percentile";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";

/* An endpoint called within this long, or streaming, counts as active now. */
export const ACTIVE_MS = 6_000;

/** What an endpoint's calls add up to: their count, and the API's figures over the requests they sent. */
export interface EndpointMetrics {
  /** Its finished calls; a stream counts once it opens. */
  calls: number;
  /** The requests those calls sent: a read another call's request answered sent none. */
  requests: number;
  /** The median and p95 durations of its HTTP requests: the API's time, not a shared read's wait. */
  p50: number | null;
  p95: number | null;
  /** The share of its requests that failed, 0–100. */
  errorRate: number;
  /** Its requests that failed. */
  errors: number;
  /** Its requests a minute since the session began. */
  perMinute: number;
  /** The average size of its requests' answers. */
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
 * it opens — and the requests they sent; over those requests, the median
 * and p95 durations of the HTTP ones, the share that failed, how many a
 * minute since the session began and their answers' average size; and
 * the last call, and whether it is active now.
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
  /* A read another call's request answered sent none, and holds that request's answer. */
  const sent = ownRequests(done);
  const http = sent.filter((r) => !isStreamRequest(r) && requestStateOf(r) !== "aborted");
  const durations = http.flatMap((r) => (r.timing ? [r.timing.total] : []));
  const errors = sent.filter((r) => isFailedState(requestStateOf(r))).length;
  const sized = http.filter((r) => r.size !== undefined);
  const last = requests.reduce<number | undefined>(
    (top, r) => (top === undefined || r.startedAt > top ? r.startedAt : top),
    undefined,
  );
  return {
    calls: done.length,
    requests: sent.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    errorRate: sent.length ? (errors / sent.length) * 100 : 0,
    errors,
    perMinute: sent.length / Math.max(1, (now - since) / 60_000),
    avgSize: sized.length ? sized.reduce((sum, r) => sum + (r.size ?? 0), 0) / sized.length : 0,
    last,
    active:
      (last !== undefined && now - last < ACTIVE_MS) ||
      requests.some((r) => requestStateOf(r) === "streaming"),
  };
}

/**
 * How an endpoint is doing: no traffic without calls; critical when a
 * fifth of its requests failed or its p95 passed twice the slow threshold;
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
