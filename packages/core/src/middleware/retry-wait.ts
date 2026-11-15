import { retryAfterWait } from "../utils/retry-after";
import type { RetryFailure } from "./types";

/** How a policy spaces its attempts. */
export interface Spacing {
  readonly delay: number;
  readonly maxDelay: number;
  readonly backoff: "fixed" | "exponential";
  readonly jitter: "full" | "none";
  readonly random: () => number;
}

/**
 * How long to wait before a retry: the delay, doubled for each retry before
 * it unless the backoff is fixed, no longer than `maxDelay` — and with full
 * jitter, a random time up to that, so the clients an outage failed at once
 * do not all come back at once.
 *
 * @param spacing - The policy's spacing
 * @param retry - How many retries came before this one
 * @returns The wait in ms
 */
export function backoffWait(spacing: Spacing, retry: number): number {
  const base = spacing.backoff === "fixed" ? spacing.delay : spacing.delay * 2 ** retry;
  const capped = Math.min(base, spacing.maxDelay);
  return spacing.jitter === "none" ? capped : Math.floor(spacing.random() * capped);
}

/**
 * How long an answer asks to be waited for before it is asked again: its
 * `Retry-After`, in seconds or as an HTTP date, as `retryAfterWait` reads
 * it — one in the past asks for no wait. A header it does not read is not
 * a wait asked for.
 *
 * @param failure - Why the attempt failed
 * @param now - The time, in ms since the epoch
 * @returns The wait in ms, or `undefined` where the answer asks for none
 */
export function retryAfterOf(failure: RetryFailure, now: number): number | undefined {
  if (failure.kind !== "status") return undefined;
  return retryAfterWait(failure.headers.get("retry-after"), now);
}
