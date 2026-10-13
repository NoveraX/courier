import type { RateLimitDecision, RateLimitWindow } from "./types";

/** One budget a call took from: its name, its size, and what taking came to. */
export interface TakenBudget {
  readonly name: string;
  readonly limit: RateLimitWindow;
  readonly decision: RateLimitDecision;
}

/**
 * The headers that tell a caller its budgets, as the IETF's RateLimit
 * header fields write them: `RateLimit-Policy` for each budget's size and
 * window in seconds, `RateLimit` for what is left of it and when it is
 * whole again, and, for a refused call, `Retry-After`.
 *
 * @param taken - The budgets the call took from
 * @returns The headers
 * @example
 * ```ts
 * rateLimitHeaders([{ name: "calls", limit: { requests: 300, window: 60_000 }, decision }]);
 * // RateLimit-Policy: "calls";q=300;w=60 — RateLimit: "calls";r=299;t=1
 * ```
 */
export function rateLimitHeaders(taken: readonly TakenBudget[]): Headers {
  const headers = new Headers();
  headers.set(
    "ratelimit-policy",
    taken
      .map(({ name, limit }) => `"${name}";q=${limit.requests};w=${seconds(limit.window)}`)
      .join(", "),
  );
  headers.set(
    "ratelimit",
    taken
      .map(
        ({ name, decision }) => `"${name}";r=${decision.remaining};t=${seconds(decision.resetMs)}`,
      )
      .join(", "),
  );
  const refused = taken.find(({ decision }) => !decision.allowed);
  if (refused) headers.set("retry-after", String(seconds(refused.decision.retryAfterMs)));
  return headers;
}

/* Whole seconds, rounded up: a caller that waits as long as it is told is never refused again for it. */
function seconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}
