import { HTTPError } from "../errors";
import { defineMiddleware } from "./compose";
import type { Middleware, MiddlewareResponse, NextFn } from "./types";

/** How one attempt ended: with an answer, or with the error it was rejected with. */
type Attempt = { readonly response: MiddlewareResponse } | { readonly error: unknown };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry middleware with exponential backoff.
 *
 * A failed attempt is judged by its answer, whether the chain returned it or
 * rejected with it as an `HTTPError`. By default the answers worth another
 * attempt are a 5xx and no answer at all — a network failure or a timeout,
 * which `retryOn` sees as status 0. A 4xx is the caller's to fix and is never
 * retried by default. An error that is not an HTTP failure, such as a
 * response that fails its schema or a middleware that throws, is not retried
 * whatever the condition says.
 *
 * @param options - How many attempts, how far apart, and which answers deserve one
 * @returns The middleware, to place on a source or an endpoint
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [retryMiddleware({ limit: 3, backoff: 300 })],
 *   groups: { ... },
 * });
 *
 * // Also retry a rate-limited request
 * retryMiddleware({ retryOn: (response) => response.status === 429 || response.status >= 500 });
 * ```
 */
export function retryMiddleware(options?: {
  /** Maximum number of retries (default: 3) */
  limit?: number;
  /** Base delay in ms between attempts (default: 300) */
  backoff?: number;
  /** How the delay grows between attempts (default: "exponential") */
  mode?: "fixed" | "exponential";
  /** Which answers deserve another attempt (default: status 0 or status >= 500) */
  retryOn?: (response: MiddlewareResponse) => boolean;
}): Middleware {
  const {
    limit = 3,
    backoff = 300,
    mode = "exponential",
    retryOn = isServerFailure,
  } = options ?? {};
  const waitFor = (attempt: number): number =>
    mode === "fixed" ? backoff : backoff * 2 ** attempt;

  return defineMiddleware("retry", "wrap", async (_ctx, next) => {
    for (let attempt = 0; ; attempt++) {
      const outcome = await settle(next);
      if (attempt >= limit || !deservesRetry(outcome, retryOn)) return unwrap(outcome);
      await delay(waitFor(attempt));
    }
  });
}

/** The default condition: the upstream failed, or never answered. */
function isServerFailure(response: MiddlewareResponse): boolean {
  return response.status === 0 || response.status >= 500;
}

async function settle(next: NextFn): Promise<Attempt> {
  try {
    return { response: await next() };
  } catch (error) {
    return { error };
  }
}

function unwrap(outcome: Attempt): MiddlewareResponse {
  if ("error" in outcome) throw outcome.error;
  return outcome.response;
}

/**
 * Should this attempt be made again?
 *
 * A non-2xx answer rejects the call as an `HTTPError`, so the condition is
 * shown the answer it carries. Any other error was not an answer, and the
 * condition cannot speak to it.
 */
function deservesRetry(
  outcome: Attempt,
  retryOn: (response: MiddlewareResponse) => boolean,
): boolean {
  if ("response" in outcome) return retryOn(outcome.response);
  const { error } = outcome;
  if (!(error instanceof HTTPError)) return false;
  return retryOn({ status: error.status, data: error.data, headers: error.headers });
}
