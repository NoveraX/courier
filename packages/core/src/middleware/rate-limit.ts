import { createAdmissionQueue } from "./admission-queue";
import { defineMiddleware } from "./compose";
import type { Middleware } from "./types";

/**
 * Rate limit middleware — delays requests to stay within limits.
 * Runs before fetch only (no response processing).
 *
 * At most `maxRequests` requests are let through in any `window`
 * milliseconds, however many calls arrive at once and however late a busy
 * event loop runs the limiter's timers: the window is measured from when each
 * request actually went, and calls beyond the limit wait their turn in the
 * order they came. A caller that cancels stops waiting at once, and its turn
 * goes to the call queued behind it.
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
  const queue = createAdmissionQueue(options.maxRequests, options.window);

  return defineMiddleware("rateLimit", "before", async (ctx) => {
    await queue.enter(ctx.signal);
  });
}
