/** How healthy a figure reads: good, worth a look, or bad. */
export type Health = "ok" | "warn" | "err";

/* The success rates from which the rate reads good, and worth a look. */
const GOOD_RATE = 95;
const FAIR_RATE = 80;

/**
 * How a latency reads against the slow-request threshold Studio's settings
 * set: good below it, slow from it, very slow from twice it.
 *
 * @param ms - The latency
 * @param slowMs - The slow threshold
 * @returns Its health
 * @example
 * ```ts
 * latencyHealth(620, 500); // "warn"
 * ```
 */
export function latencyHealth(ms: number, slowMs: number): Health {
  if (ms >= slowMs * 2) return "err";
  return ms >= slowMs ? "warn" : "ok";
}

/**
 * How a success rate reads: good from 95%, worth a look from 80%.
 *
 * @param rate - The rate, 0–100
 * @returns Its health
 * @example
 * ```ts
 * successHealth(91.9); // "warn"
 * ```
 */
export function successHealth(rate: number): Health {
  if (rate >= GOOD_RATE) return "ok";
  return rate >= FAIR_RATE ? "warn" : "err";
}

/**
 * How an error rate reads: none is quiet, up to 10% is worth a look,
 * more is bad.
 *
 * @param rate - The share of calls that failed, 0–100
 * @returns Its health, `muted` for none
 * @example
 * ```ts
 * errorHealth(55.6); // "err"
 * ```
 */
export function errorHealth(rate: number): Health | "muted" {
  if (rate === 0) return "muted";
  return rate <= 10 ? "warn" : "err";
}
