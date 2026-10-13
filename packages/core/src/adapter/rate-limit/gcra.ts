import type { RateLimitDecision, RateLimitWindow } from "./types";

/**
 * Take one call from a budget kept as one number, the Generic Cell Rate
 * Algorithm's: the time the caller's calls are spent up to. A budget of
 * `requests` per `window` lets that many go at once and then one each
 * `window / requests` — smooth, where a counter reset each window lets
 * twice the budget through across a window's edge.
 *
 * @param spentUntil - The time the caller's calls are spent up to, or `undefined` for a new caller
 * @param limit - The budget
 * @param now - The time, in milliseconds
 * @returns What taking the call came to, and the time to keep for the caller
 * @example
 * ```ts
 * takeCall(undefined, { requests: 3, window: 3000 }, 0);
 * // → { decision: { allowed: true, remaining: 2, resetMs: 1000, retryAfterMs: 0 }, spentUntil: 1000 }
 * ```
 */
export function takeCall(
  spentUntil: number | undefined,
  limit: RateLimitWindow,
  now: number,
): { decision: RateLimitDecision; spentUntil: number } {
  const interval = limit.window / limit.requests;
  const from = Math.max(spentUntil ?? now, now);
  const next = from + interval;
  const allowedAt = next - limit.window;
  if (now < allowedAt) {
    const decision = {
      allowed: false,
      remaining: 0,
      resetMs: from - now,
      retryAfterMs: allowedAt - now,
    };
    return { decision, spentUntil: from };
  }
  const remaining = Math.floor((limit.window - (next - now)) / interval + 1e-9);
  return {
    decision: { allowed: true, remaining, resetMs: next - now, retryAfterMs: 0 },
    spentUntil: next,
  };
}
