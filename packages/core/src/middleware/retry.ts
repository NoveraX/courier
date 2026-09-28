import { ValidationError } from "../validation";
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
  /** Base delay in ms between attempts (default: 300) */
  backoff?: number;
  /** How the delay grows between attempts (default: "exponential") */
  mode?: "fixed" | "exponential";
  /** Custom retry condition (default: status >= 500) */
  retryOn?: (response: MiddlewareResponse) => boolean;
}): Middleware {
  const { limit = 3, backoff = 300, mode = "exponential", retryOn } = options ?? {};
  const waitFor = (attempt: number): number =>
    mode === "fixed" ? backoff : backoff * 2 ** attempt;

  return defineMiddleware("retry", "wrap", async (_ctx, next) => {
    for (let attempt = 0; attempt <= limit; attempt++) {
      try {
        const response = await next();

        if (attempt < limit && (retryOn ? retryOn(response) : response.status >= 500)) {
          await delay(waitFor(attempt));
          continue;
        }

        return response;
      } catch (error) {
        /* A failing status may arrive as a thrown error rather than a
           response. A caller that named the statuses worth retrying means
           that list either way, so anything outside it is not retried. */
        if (attempt === limit || !shouldRetryError(error, retryOn)) throw error;
        await delay(waitFor(attempt));
      }
    }

    throw new Error("Retry exhausted");
  });
}

/**
 * Should a thrown failure be retried?
 *
 * Without a condition every error is worth another attempt. With one, a status
 * the caller can read decides; an error carrying no status is retried, since
 * the condition cannot speak to it. A response that failed its schema is
 * never retried: the same answer fails the same way every time.
 */
function shouldRetryError(
  error: unknown,
  retryOn: ((response: MiddlewareResponse) => boolean) | undefined,
): boolean {
  if (error instanceof ValidationError) return false;
  if (!retryOn) return true;
  const status = (error as { status?: unknown })?.status;
  if (typeof status !== "number") return true;
  return retryOn({ status } as MiddlewareResponse);
}
