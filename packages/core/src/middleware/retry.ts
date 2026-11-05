import type { RetryOptions } from "../define/options";
import { isCancellation } from "../utils/abort";
import { cancellation } from "../utils/cancellation";
import { isReplayableBody } from "../utils/replayable-body";
import { pause, waitUnlessStopped } from "./pause";
import { type RetryBudget, retryBudget } from "./retry-budget";
import { neverLeft, retriedByDefault } from "./retry-causes";
import { startDeadline } from "./retry-deadline";
import { RETRY_DEFAULTS } from "./retry-defaults";
import { type Attempt, failureOf } from "./retry-failure";
import { assertRetryOptions } from "./retry-options";
import { backoffWait, retryAfterOf } from "./retry-wait";
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareResponse,
  NextFn,
  RetryFailure,
  WrapMiddleware,
} from "./types";

/**
 * Retry middleware: a failed attempt made again, as a retry policy says.
 *
 * An attempt is judged by why it failed: an answer that was not a success
 * by its status; a request that got no answer — a `NetworkError` — as
 * `"network"`; one whose own time ran out — a `TimeoutError` — as
 * `"timeout"`. By default `"network"` and the answers 408, 425, 429, 500,
 * 502, 503 and 504 are retried; a timeout is not, as a slow upstream would
 * only be made slower, nor a certificate the platform refused, nor a 4xx
 * the caller has to fix. An error that is none of these, such as a
 * response that fails its schema or a middleware that throws, is never
 * retried, whatever `retryOn` says.
 *
 * Each wait is a random time up to a delay that doubles with each retry,
 * no longer than `maxDelay` — or what an answer's `Retry-After` asks, in
 * seconds or as a date; an answer asking for longer than `maxDelay` is not
 * retried. A `deadline` bounds the attempts and the waits together: no
 * wait starts that would end past it, and an attempt it overtakes stops
 * with a `TimeoutError` of scope `"deadline"`. The calls a policy retries
 * share a budget, so an upstream that keeps failing gets fewer retries,
 * not a storm of them.
 *
 * A cancellation is never retried: not the caller's, whatever reason it
 * gave, and not a call that a newer one superseded. A call cancelled while
 * the middleware waits between attempts, or just after an attempt failed,
 * is answered at once with an `AbortError` rather than the failure it no
 * longer waits on.
 *
 * An endpoint that writes is sent once, since a write whose answer was lost
 * may still have been carried out — unless it declares an
 * `idempotencyKey`, whose one key on every attempt lets the upstream apply
 * it once, or its request certainly never left: its host had no address or
 * refused the connection. `mutations: true` retries every write, `false`
 * none. A call whose body is a stream, which cannot be sent twice, is sent
 * once.
 *
 * @param options - How many attempts, how far apart, within what time, and which failures deserve one
 * @returns The middleware, to place on a source or an endpoint
 * @throws {ConfigurationError} `RETRY_OPTIONS_INVALID`, for options it cannot work with
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [retryMiddleware({ limit: 3, delay: 300, deadline: 10_000 })],
 *   groups: { ... },
 * });
 *
 * // Also retry a request whose time ran out
 * retryMiddleware({ retryOn: ["network", "timeout", 429, 502, 503, 504] });
 *
 * // Every write too: the upstream recognises a repeated one by its own means
 * retryMiddleware({ mutations: true });
 * ```
 */
export function retryMiddleware(options: RetryOptions = {}): Middleware {
  return retryPolicy(options, retryBudget());
}

/**
 * The retry middleware a policy makes, drawing on the budget it is given:
 * `retryMiddleware` gives each one its own; the endpoints of one API share
 * theirs.
 *
 * @param options - The policy
 * @param budget - The retries it may still spend
 * @returns The middleware
 */
export function retryPolicy(options: RetryOptions, budget: RetryBudget): WrapMiddleware {
  assertRetryOptions(options);
  const { limit = RETRY_DEFAULTS.limit, deadline, mutations, onRetry } = options;
  const spacing = {
    delay: options.delay ?? RETRY_DEFAULTS.delay,
    maxDelay: options.maxDelay ?? RETRY_DEFAULTS.maxDelay,
    backoff: options.backoff ?? "exponential",
    jitter: options.jitter ?? "full",
    random: options.random ?? Math.random,
  };
  const retryOn = conditionOf(options.retryOn);

  const handler: WrapMiddleware["handler"] = async (ctx, next) => {
    /* A write is retried when asked to, or when its idempotency key lets the upstream apply it once. */
    const writes = mutations ?? ctx.idempotencyKey !== undefined;
    const mayRepeat = (failure: RetryFailure): boolean =>
      ctx.kind !== "mutation" || writes || (mutations !== false && neverLeft(failure));
    const outer = ctx.signal;
    const limitTo = deadline === undefined ? undefined : startDeadline(deadline, outer);
    if (limitTo) ctx.signal = limitTo.signal;
    let spent: number | undefined;
    try {
      for (let retry = 0; ; retry++) {
        const outcome = await settle(next);
        const failure = failureOf(outcome);
        if (failure === undefined && "response" in outcome) budget.answered(spent);
        const repeat =
          retry < limit && !endedByCancellation(outcome, outer) && isReplayableBody(ctx.variables);
        if (failure === undefined || !repeat || !retryOn(failure) || !mayRepeat(failure)) {
          return unwrap(outcome, outer);
        }
        const wait = waitBefore(failure, retry, spacing.maxDelay);
        if (wait === undefined || (limitTo && wait >= limitTo.left()))
          return unwrap(outcome, outer);
        spent = budget.spend(failure);
        if (spent === undefined) return unwrap(outcome, outer);
        if (onRetry) {
          await waitUnlessStopped(
            onRetry({ attempt: retry + 2, delay: wait, failure }, ctx),
            ctx.signal,
          );
        }
        await pause(wait, ctx.signal);
      }
    } finally {
      limitTo?.end();
      ctx.signal = outer;
    }
  };
  return { name: "retry", phase: "wrap", handler };

  /* An answer's Retry-After where it asks for a wait, else the backoff; past the cap, no retry. */
  function waitBefore(failure: RetryFailure, retry: number, cap: number): number | undefined {
    const asked = retryAfterOf(failure, Date.now());
    if (asked === undefined) return backoffWait(spacing, retry);
    return asked > cap ? undefined : asked;
  }
}

/** The test a failure is put to, from what a policy lists or the test it names. */
function conditionOf(retryOn: RetryOptions["retryOn"]): (failure: RetryFailure) => boolean {
  if (retryOn === undefined) return retriedByDefault;
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
  if (signal?.aborted) throw cancellation(signal);
  throw outcome.error;
}

/**
 * Did this attempt end because nobody wants its answer any more?
 *
 * The caller's signal says so whatever the attempt was rejected with; so
 * does an `AbortError` — the call's own, or one a newer call superseded.
 */
function endedByCancellation(outcome: Attempt, signal: MiddlewareContext["signal"]): boolean {
  if (signal?.aborted) return true;
  return "error" in outcome && isCancellation(outcome.error);
}
