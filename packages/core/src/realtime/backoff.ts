import { ConfigurationError } from "../errors/configuration-error";
import { ownFields } from "../utils/own";
import type { BackoffConfig } from "./types";

/** A source of numbers in [0, 1), as `Math.random` is; a test hands in its own. */
export type Random = () => number;

/** A backoff with every setting read and checked. */
export interface Backoff {
  readonly initialMs: number;
  readonly maxMs: number;
  readonly factor: number;
  readonly jitter: boolean;
}

const DEFAULTS: Backoff = { initialMs: 1000, maxMs: 30_000, factor: 2, jitter: true };

/* Past this exponent every delay is at its cap anyway; it also keeps an
   initial delay of 0 from meeting Infinity, whose product is NaN. */
const MAX_EXPONENT = 30;

/**
 * Read a connection's backoff, each setting given as `undefined` keeping
 * its default.
 *
 * @param config - The caller's `backoff`
 * @returns The backoff the connection waits by
 * @throws {ConfigurationError} `INVALID_BACKOFF` for a delay that is not a
 *   finite number of ms from 0, or a factor below 1
 * @example
 * ```ts
 * resolveBackoff({ maxMs: 10_000 }); // → { initialMs: 1000, maxMs: 10000, factor: 2, jitter: true }
 * ```
 */
export function resolveBackoff(given?: BackoffConfig): Backoff {
  const config = ownFields(given);
  const backoff: Backoff = {
    initialMs: config.initialMs ?? DEFAULTS.initialMs,
    maxMs: config.maxMs ?? DEFAULTS.maxMs,
    factor: config.factor ?? DEFAULTS.factor,
    jitter: config.jitter ?? DEFAULTS.jitter,
  };
  for (const name of ["initialMs", "maxMs"] as const) {
    const value = backoff[name];
    if (!Number.isFinite(value) || value < 0) invalid(`backoff.${name} is ${value}`);
  }
  if (!Number.isFinite(backoff.factor) || backoff.factor < 1) {
    invalid(`backoff.factor is ${backoff.factor}`);
  }
  return backoff;
}

function invalid(what: string): never {
  throw new ConfigurationError(
    "INVALID_BACKOFF",
    `[courier] ${what}: a delay is a finite number of ms from 0, and the factor at least 1.`,
  );
}

/**
 * How long to wait before reconnect attempt `attempt`, counted from 0 for
 * the first after a connection that worked: a random point between 0 and
 * `min(maxMs, initialMs × factor^attempt)` — "full jitter", so clients that
 * lost a server together do not come back to it together. Without jitter,
 * the exponential delay itself.
 *
 * @param attempt - Attempts made since the connection last worked
 * @param backoff - The connection's backoff
 * @param random - Where the jitter comes from
 * @returns The delay in whole ms
 * @example
 * ```ts
 * backoffDelay(3, resolveBackoff({ jitter: false })); // → 8000
 * backoffDelay(3, resolveBackoff()); // → somewhere in [0, 8000)
 * ```
 */
export function backoffDelay(
  attempt: number,
  backoff: Backoff,
  random: Random = Math.random,
): number {
  const exponent = Math.min(Math.max(attempt, 0), MAX_EXPONENT);
  const ceiling = Math.min(backoff.maxMs, backoff.initialMs * backoff.factor ** exponent);
  return backoff.jitter ? Math.floor(random() * ceiling) : ceiling;
}

/**
 * How long to wait when the server said how long: never sooner than it
 * asked, and spread past it as a backoff is, so that clients told the same
 * wait — a server going away, one at capacity — do not all return at once.
 *
 * @param hintMs - The wait the server asked for
 * @param attempt - Attempts made since the connection last worked
 * @param backoff - The connection's backoff
 * @param random - Where the jitter comes from
 * @returns The delay in whole ms
 * @example
 * ```ts
 * hintedDelay(5000, 0, resolveBackoff()); // → somewhere in [5000, 6000)
 * ```
 */
export function hintedDelay(
  hintMs: number,
  attempt: number,
  backoff: Backoff,
  random: Random = Math.random,
): number {
  return Math.max(0, Math.floor(hintMs)) + backoffDelay(attempt, backoff, random);
}
