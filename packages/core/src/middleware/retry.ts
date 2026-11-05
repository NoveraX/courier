import type { RetryOptions } from "../define/options";
import { HTTPError } from "../errors";
import { isAbortError } from "../utils/abort";
import { abortReason } from "../utils/abort-reason";
import { defineMiddleware } from "./define";
import { pause } from "./pause";
import { type Attempt, failureOf } from "./retry-failure";
import { assertRetryOptions } from "./retry-options";
import type { Middleware, MiddlewareResponse, NextFn, RetryFailure } from "./types";

/** What a request a newer identical one replaced is rejected with. */
const CLIENT_CLOSED_REQUEST = 499;

/**
 * Retry middleware with exponential backoff.
 *
 * A failed attempt is judged by why it failed: an answer that was not a
 * success, whether the chain returned it or rejected with it as an
 * `HTTPError`, by its status; a request that got no answer — a
 * `NetworkError` — as `"network"`; one whose time ran out — a
 * `TimeoutError` — as `"timeout"`. By default a 5xx, `"network"` and
 * `"timeout"` are worth another attempt. A 4xx is the caller's to fix and is
 * never retried by default. An error that is none of these, such as a
 * response that fails its schema or a middleware that throws, is not
 * retried whatever the condition says.
 *
 * A cancellation is never retried: not the caller's, whatever reason it gave,
 * and not a call that a newer one replaced (status 499). A call cancelled
 * while the middleware waits between attempts, or just after an attempt
 * failed, is answered at once with its signal's reason rather than the
 * failure it no longer waits on.
 *
 * An endpoint that writes is sent once, since a write whose answer was lost
 * may still have been carried out, and sending it again charges a card
 * twice — unless it declares an `idempotencyKey`, whose one key on every
 * attempt lets the upstream apply it once, or `mutations` is set: `true`
 * for an upstream that recognises a repeated write some other way, `false`
 * to retry no write, keys included. An endpoint declared a read with
 * `.reads()` is retried whatever verb carries it.
 *
 * @param options - How many attempts, how far apart, and which answers deserve one
 * @returns The middleware, to place on a source or an endpoint
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [retryMiddleware({ limit: 3, delay: 300 })],
 *   groups: { ... },
 * });
 *
 * // Also retry a rate-limited request
 * retryMiddleware({ retryOn: ["network", "timeout", 429, 500, 502, 503, 504] });
 *
 * // Every write too: the upstream recognises a repeated one by its own means
 * retryMiddleware({ mutations: true });
 * ```
 */
export function retryMiddleware(options: RetryOptions = {}): Middleware {
  assertRetryOptions(options);
  const { limit = 3, delay = 300, backoff = "exponential", mutations } = options;
  const retryOn = conditionOf(options.retryOn);
  const waitFor = (attempt: number): number => (backoff === "fixed" ? delay : delay * 2 ** attempt);

  return defineMiddleware("retry", "wrap", async (ctx, next) => {
    /* A write is retried when asked to, or when its idempotency key lets the upstream apply it once. */
    const writes = mutations ?? ctx.idempotencyKey !== undefined;
    const retries = ctx.kind === "mutation" && !writes ? 0 : limit;
    for (let attempt = 0; ; attempt++) {
      const outcome = await settle(next);
      const failure = failureOf(outcome);
      const retry =
        attempt < retries &&
        !isCancellation(outcome, ctx.signal) &&
        failure !== undefined &&
        retryOn(failure);
      if (!retry) return unwrap(outcome, ctx.signal);
      await pause(waitFor(attempt), ctx.signal);
    }
  });
}

/** The default condition: the upstream failed, never answered, or ran out of time. */
function isServerFailure(failure: RetryFailure): boolean {
  return failure.kind !== "status" || failure.status >= 500;
}

/** The test a failure is put to, from what a policy lists or the test it names. */
function conditionOf(retryOn: RetryOptions["retryOn"]): (failure: RetryFailure) => boolean {
  if (retryOn === undefined) return isServerFailure;
  if (typeof retryOn === "function") return retryOn;
  const listed = new Set(retryOn);
  return (failure) => listed.has(failure.kind === "status" ? failure.status : failure.kind);
}

async function settle(next: NextFn): Promise<Attempt> {
  try {
    return { response: await next() };
  } catch (error) {
    return { error };
  }
}

function unwrap(outcome: Attempt, signal: AbortSignal | undefined): MiddlewareResponse {
  if (!("error" in outcome)) return outcome.response;
  if (signal?.aborted) throw abortReason(signal);
  throw outcome.error;
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
