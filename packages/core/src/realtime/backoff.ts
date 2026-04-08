import type { BackoffConfig } from "./types";

const DEFAULTS = {
  initialMs: 1000,
  maxMs: 30_000,
  factor: 2,
  jitter: true,
} as const satisfies Required<BackoffConfig>;

/**
 * Calculate reconnection delay with exponential backoff and optional jitter.
 * Formula: min(initialMs * factor^attempt, maxMs) * jitter(0.5..1.0)
 *
 * @param attempt - Zero-based attempt counter
 * @param config - Backoff configuration overrides
 * @returns Delay in milliseconds before next reconnection attempt
 *
 * @example
 * calculateBackoff(0) // ~1000ms
 * calculateBackoff(3) // ~8000ms (capped at maxMs)
 */
export function calculateBackoff(attempt: number, config?: BackoffConfig): number {
  const { initialMs, maxMs, factor, jitter } = { ...DEFAULTS, ...config };
  const exponential = Math.min(initialMs * factor ** attempt, maxMs);

  if (!jitter) return exponential;

  // Jitter: random value between 50% and 100% of exponential delay
  return Math.floor(exponential * (0.5 + Math.random() * 0.5));
}
