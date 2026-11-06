import type { ResolvedEndpointOptions, RetryOptions } from "../define/options";
import type { BoundMethodOptions } from "../http-client/types";
import { defineMiddleware } from "../middleware/define";
import type * as RetryPolicies from "../middleware/retry-policies";
import type { Middleware } from "../middleware/types";
import { anySignal } from "./any-signal";
import { ownField } from "./own";

/* The policies' code, loaded with the first call whose endpoint has one. */
let retryPolicies: Promise<typeof RetryPolicies> | undefined;

/**
 * Order the middleware a request runs through.
 *
 * Source-level middleware wraps the endpoint's own, so a concern declared once
 * for the whole API still observes a request an endpoint also decorated. A
 * retry policy sits outside the endpoint's middleware so a retried attempt
 * runs them again. An endpoint's policy is made once, not on every call, and
 * spends the retry budget its API's endpoints share; its code is loaded with
 * the first call that has one, so a page whose endpoints retry nothing never
 * loads it.
 *
 * @param source - The API the endpoint belongs to
 * @param sourceMiddleware - The API's own middleware
 * @param endpointOptions - The endpoint's resolved options
 * @returns The middleware, outermost first
 */
export function resolveMiddlewareChain(
  source: object,
  sourceMiddleware: readonly Middleware[] | undefined,
  endpointOptions: ResolvedEndpointOptions | undefined,
): Middleware[] {
  const policy = ownField(endpointOptions, "retry");
  const retry = policy ? [endpointPolicy(source, policy)] : [];
  return [
    ...(sourceMiddleware ?? []),
    ...retry,
    ...(ownField(endpointOptions, "middleware") ?? []),
  ];
}

function endpointPolicy(source: object, options: RetryOptions): Middleware {
  /* Loaded with the first call that retries. A load that failed is tried again by the next call:
     Node and React Native fetch the module anew, a browser may answer with the failure it kept,
     and a module that threw as it ran throws again everywhere, as an ES module that failed so is
     kept. */
  return defineMiddleware("retry", "wrap", async (ctx, next) => {
    retryPolicies ??= import("../middleware/retry-policies").catch((cause: unknown) => {
      retryPolicies = undefined;
      throw cause;
    });
    return (await retryPolicies).endpointRetry(source, options)(ctx, next);
  });
}

/**
 * Apply the endpoint's timeout unless the call named one of its own.
 *
 * A value passed at the call site is the most specific and wins, then the
 * endpoint's own, then the caller's default, which is kept apart from the
 * call's options so it never beats the endpoint's.
 *
 * @param baseOptions - The call's options
 * @param endpointOptions - The endpoint's resolved options
 * @param callerDefault - The caller's default timeout, if it set one
 * @returns The options with the timeout that applies
 *
 * @example
 * ```ts
 * withEndpointTimeout({}, { timeout: 2000 }, 100); // → { timeout: 2000 }
 * ```
 */
export function withEndpointTimeout<T extends Partial<BoundMethodOptions>>(
  baseOptions: T,
  endpointOptions: ResolvedEndpointOptions | undefined,
  callerDefault?: number,
): T {
  if (ownField(baseOptions, "timeout") !== undefined) return baseOptions;
  const timeout = ownField(endpointOptions, "timeout") ?? callerDefault;
  return timeout === undefined ? baseOptions : { ...baseOptions, timeout };
}

/**
 * Stop the upstream call when the caller of the proxy goes away.
 *
 * The incoming request's signal joins whatever signal the call already
 * carries, so a client that leaves — a closed tab, a cancelled query — does
 * not leave a busy page holding upstream connections nobody waits for.
 *
 * @param baseOptions - Options for the upstream call
 * @param request - The request that reached the proxy, when there is one
 * @returns The options, cancelled when either signal fires
 */
export function withCallerSignal<T extends Partial<BoundMethodOptions>>(
  baseOptions: T,
  request: Request | undefined,
): T {
  if (!request) return baseOptions;
  const own = ownField(baseOptions, "signal");
  return { ...baseOptions, signal: own ? anySignal([own, request.signal]) : request.signal };
}
