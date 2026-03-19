import { defineMiddleware } from "./compose";
import type { Middleware } from "./types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limit middleware — delays requests to stay within limits.
 * Runs before fetch only (no response processing).
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
}): Middleware {
  const { maxRequests, window: windowMs } = options;
  const timestamps: number[] = [];

  return defineMiddleware("rateLimit", "before", async () => {
    const now = Date.now();

    // Remove expired timestamps
    while (timestamps.length > 0 && (timestamps[0] ?? 0) <= now - windowMs) {
      timestamps.shift();
    }

    // Wait if at limit
    if (timestamps.length >= maxRequests && timestamps[0] !== undefined) {
      const waitMs = timestamps[0] + windowMs - now;
      await delay(waitMs);
    }

    timestamps.push(Date.now());
  });
}
