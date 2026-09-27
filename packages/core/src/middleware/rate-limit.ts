import { defineMiddleware } from "./compose";
import { pause } from "./pause";
import type { Middleware } from "./types";

/**
 * Rate limit middleware — delays requests to stay within limits.
 * Runs before fetch only (no response processing).
 *
 * At most `maxRequests` requests are let through in any `window`
 * milliseconds, however many calls arrive at once: each call is given its
 * turn when it arrives, and calls beyond the limit wait for theirs in the
 * order they came. A caller that cancels stops waiting at once; its turn stays
 * spent, so the limit is never exceeded.
 *
 * @param options - How many requests a window admits, and how long a window is
 * @returns The middleware, to place on a source or an endpoint
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [rateLimitMiddleware({ maxRequests: 10, window: 1000 })],
 *   groups: { ... },
 * });
 * ```
 */
export function rateLimitMiddleware(options: {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  window: number;
}): Middleware {
  const { maxRequests, window: windowMs } = options;
  /* When each admitted request is let through, in order. A turn is taken
     before waiting, so callers arriving together queue behind one another
     rather than all waking at the same moment. */
  const turns: number[] = [];

  return defineMiddleware("rateLimit", "before", async (ctx) => {
    const now = Date.now();
    while (turns.length > 0 && (turns[0] ?? now) + windowMs <= now) turns.shift();

    const at =
      turns.length < maxRequests ? now : (turns[turns.length - maxRequests] ?? now) + windowMs;
    turns.push(at);

    if (at > now) await pause(at - now, ctx.signal);
  });
}
