import { HTTPError } from "../errors";
import { isAbortError } from "../utils/abort";
import { defineMiddleware } from "./compose";
import type { Middleware, MiddlewareResponse, NextFn } from "./types";

/** How one attempt ended: with an answer, or with the error it was rejected with. */
type Attempt = { readonly response: MiddlewareResponse } | { readonly error: unknown };

/** What a request a newer identical one replaced is rejected with. */
const CLIENT_CLOSED_REQUEST = 499;

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
 * A cancellation is never retried: not the caller's, whatever reason it gave,
 * and not a request that a newer identical one replaced (status 499). A
 * caller that cancels while the middleware waits between attempts is answered
 * at once with its signal's reason.
 *
 * An endpoint that writes is sent once unless `mutations` is set. A write
 * whose answer was lost may still have been carried out, and sending it again
 * charges a card twice; set it only when the upstream recognises a repeated
 * write, for example by an idempotency key. An endpoint declared a read with
 * `.reads()` is retried whatever verb carries it.
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
 *
 * // Writes too: the upstream deduplicates them by their Idempotency-Key
 * retryMiddleware({ mutations: true });
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
  /** Retry endpoints that write as well as those that read (default: false) */
  mutations?: boolean;
}): Middleware {
  const {
    limit = 3,
    backoff = 300,
    mode = "exponential",
    retryOn = isServerFailure,
    mutations = false,
  } = options ?? {};
  const waitFor = (attempt: number): number =>
    mode === "fixed" ? backoff : backoff * 2 ** attempt;

  return defineMiddleware("retry", "wrap", async (ctx, next) => {
    const retries = ctx.kind === "mutation" && !mutations ? 0 : limit;
    for (let attempt = 0; ; attempt++) {
      const outcome = await settle(next);
      const retry =
        attempt < retries &&
        !isCancellation(outcome, ctx.signal) &&
        deservesRetry(outcome, retryOn);
      if (!retry) return unwrap(outcome);
      await pause(waitFor(attempt), ctx.signal);
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
 * Did this attempt end because nobody wants its answer any more?
 *
 * The caller's signal says so whatever the attempt was rejected with; a
 * cancellation given a reason reaches here as that reason, not as an abort.
 */
function isCancellation(outcome: Attempt, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  if (!("error" in outcome)) return false;
  const { error } = outcome;
  return (
    isAbortError(error) || (error instanceof HTTPError && error.status === CLIENT_CLOSED_REQUEST)
  );
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

/** Wait before the next attempt, and throw the signal's reason if the caller cancels meanwhile. */
async function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
  signal?.throwIfAborted();
}
