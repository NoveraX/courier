import type { RequestEntry } from "@/store/types";

/**
 * The "now" the shown requests are read against: the time now while the
 * live requests show, and the end of the last call while a saved session
 * shows — its last minute is the minute before it ended, not the minute
 * before the clock reads now.
 *
 * @param requests - The requests shown
 * @param now - The time now
 * @param saved - Whether they are a saved session's
 * @returns The time to read them against
 * @example
 * ```ts
 * shownNow(sessionRequests, Date.now(), true); // when the session's last call finished
 * ```
 */
export function shownNow(requests: readonly RequestEntry[], now: number, saved: boolean): number {
  if (!saved || requests.length === 0) return now;
  return requests.reduce((end, r) => Math.max(end, r.startedAt + (r.timing?.total ?? 0)), 0);
}
