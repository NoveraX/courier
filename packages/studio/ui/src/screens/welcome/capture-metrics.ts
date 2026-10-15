import type { RequestEntry } from "@/store";

/** The capture panel's four numbers. */
export interface CaptureMetrics {
  count: number;
  /** Requests a second over the last ten seconds. */
  perSecond: number;
  /** The 95th percentile of the finished requests' durations, in ms; `null` before any finishes. */
  p95: number | null;
  /** The share of requests that failed, in percent. */
  errorRate: number;
}

/* The window the rate is taken over. */
const RATE_WINDOW_MS = 10_000;

/**
 * The numbers over the captured requests: how many, how fast they come, how
 * slow the slowest are, and how many fail.
 *
 * @param requests - The captured requests
 * @param now - The time to take the rate at
 * @returns The metrics
 * @example
 * ```ts
 * captureMetrics(useStudioStore.getState().requests, Date.now()).p95;
 * ```
 */
export function captureMetrics(requests: readonly RequestEntry[], now: number): CaptureMetrics {
  const durations = requests
    .flatMap((r) => (r.timing && r.shared === undefined ? [r.timing.total] : []))
    .sort((a, b) => a - b);
  const recent = requests.filter((r) => now - r.startedAt < RATE_WINDOW_MS).length;
  const errors = requests.filter((r) => r.status === "error").length;
  return {
    count: requests.length,
    perSecond: recent / (RATE_WINDOW_MS / 1000),
    p95:
      durations.length === 0
        ? null
        : (durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? null),
    errorRate: requests.length === 0 ? 0 : (errors / requests.length) * 100,
  };
}
