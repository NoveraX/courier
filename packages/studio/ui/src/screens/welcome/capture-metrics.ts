import { ownRequests } from "@/features/requests/own-requests";
import { isFailedState, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store";

/** The capture panel's four numbers: the network's, so a read another call's request answered is in none. */
export interface CaptureMetrics {
  /** The requests the captured calls sent. */
  requests: number;
  /** Requests a second over the last ten seconds. */
  perSecond: number;
  /** The 95th percentile of the finished requests' durations, in ms; `null` before any finishes. */
  p95: number | null;
  /** The share of requests that failed — an error, or an answer its schema refused — in percent. */
  errorRate: number;
}

/* The window the rate is taken over. */
const RATE_WINDOW_MS = 10_000;

/**
 * The numbers over the requests the captured calls sent: how many, how
 * fast they come, how slow the slowest are, and how many fail.
 *
 * @param requests - The captured calls
 * @param now - The time to take the rate at
 * @returns The metrics
 * @example
 * ```ts
 * captureMetrics(useStudioStore.getState().requests, Date.now()).p95;
 * ```
 */
export function captureMetrics(requests: readonly RequestEntry[], now: number): CaptureMetrics {
  const sent = ownRequests(requests);
  const durations = sent.flatMap((r) => (r.timing ? [r.timing.total] : [])).sort((a, b) => a - b);
  const recent = sent.filter((r) => now - r.startedAt < RATE_WINDOW_MS).length;
  const errors = sent.filter((r) => isFailedState(requestStateOf(r))).length;
  return {
    requests: sent.length,
    perSecond: recent / (RATE_WINDOW_MS / 1000),
    p95:
      durations.length === 0
        ? null
        : (durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? null),
    errorRate: sent.length === 0 ? 0 : (errors / sent.length) * 100,
  };
}
