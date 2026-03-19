import { defineMiddleware } from "./compose";
import type { Middleware, MiddlewareResponse } from "./types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry middleware with exponential backoff.
 *
 * @example
 * defineApi({
 *   middleware: [retryMiddleware({ limit: 3, backoff: 300 })],
 *   groups: { ... },
 * })
 */
export function retryMiddleware(options?: {
  /** Maximum number of retries (default: 3) */
  limit?: number;
  /** Base delay in ms for exponential backoff (default: 300) */
  backoff?: number;
  /** Custom retry condition (default: status >= 500) */
  retryOn?: (response: MiddlewareResponse) => boolean;
}): Middleware {
  const { limit = 3, backoff = 300, retryOn } = options ?? {};

  return defineMiddleware("retry", "wrap", async (_ctx, next) => {
    for (let attempt = 0; attempt <= limit; attempt++) {
      try {
        const response = await next();

        if (attempt < limit && (retryOn ? retryOn(response) : response.status >= 500)) {
          await delay(backoff * 2 ** attempt);
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === limit) throw error;
        await delay(backoff * 2 ** attempt);
      }
    }

    throw new Error("Retry exhausted");
  });
}
