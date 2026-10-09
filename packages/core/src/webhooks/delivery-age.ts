/* How old a delivery may be before it is taken for a replay: Stripe's and Standard Webhooks' own default. */
const TOLERANCE_MS = 5 * 60 * 1000;
const SECONDS = /^\d{1,12}$/;

/**
 * Whether a delivery's signed timestamp is recent enough not to be a replay:
 * whole seconds since the epoch, within five minutes of now either way. A
 * timestamp that is not whole seconds is not recent.
 *
 * @param timestamp - The timestamp the sender signed, in seconds
 * @param now - The time now, in milliseconds
 * @returns Whether the delivery is recent
 * @example
 * ```ts
 * isRecent("1700000000", 1700000060_000); // true
 * ```
 */
export function isRecent(timestamp: string, now: number): boolean {
  return SECONDS.test(timestamp) && Math.abs(now - Number(timestamp) * 1000) <= TOLERANCE_MS;
}
