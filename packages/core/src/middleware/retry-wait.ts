import type { RetryFailure } from "./types";

/* Retry-After in seconds: digits alone, as RFC 9110 writes delay-seconds; ten of them are past any cap. */
const SECONDS = /^\d{1,10}$/;

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
 * `Retry-After`, in seconds or as an HTTP date — one in the past asks for
 * no wait. A header that says neither is not read.
 *
 * @param failure - Why the attempt failed
 * @param now - The time, in ms since the epoch
 * @returns The wait in ms, or `undefined` where the answer asks for none
 */
export function retryAfterOf(failure: RetryFailure, now: number): number | undefined {
  if (failure.kind !== "status") return undefined;
  const said = failure.headers.get("retry-after")?.trim();
  if (said === undefined || said === "") return undefined;
  if (SECONDS.test(said)) return Number(said) * 1000;
  const at = Date.parse(said);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}
