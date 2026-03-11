import { defineMiddleware } from "./compose";
import type { MiddlewareFn } from "./types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limit middleware — delays requests to stay within limits.
 *
 * @example
 * defineApi({
 *   middleware: [rateLimitMiddleware({ maxRequests: 10, window: 1000 })],
 *   groups: { ... },
 * })
 */
export function rateLimitMiddleware(options: {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  window: number;
}): MiddlewareFn {
  const { maxRequests, window: windowMs } = options;
  const timestamps: number[] = [];

  return defineMiddleware(async (_ctx, next) => {
    const now = Date.now();

    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0]! <= now - windowMs) {
      timestamps.shift();
    }

    // Wait if at limit
    if (timestamps.length >= maxRequests && timestamps[0] !== undefined) {
      const waitMs = timestamps[0] + windowMs - now;
      await delay(waitMs);
    }

    timestamps.push(Date.now());
    return next();
  });
}
