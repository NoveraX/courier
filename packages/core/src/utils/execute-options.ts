import type { ResolvedEndpointOptions, RetryOptions } from "../define/options";
import type { BoundMethodOptions } from "../http-client/types";
import { retryMiddleware } from "../middleware/retry";
import type { Middleware, MiddlewareResponse } from "../middleware/types";

/**
 * Order the middleware a request runs through.
 *
 * Source-level middleware wraps the endpoint's own, so a concern declared once
 * for the whole API still observes a request an endpoint also decorated. A
 * retry policy sits outside the endpoint's middleware so a retried attempt
 * runs them again.
 */
export function resolveMiddlewareChain(
  sourceMiddleware: readonly Middleware[] | undefined,
  endpointOptions: ResolvedEndpointOptions | undefined,
): Middleware[] {
  const retry = endpointOptions?.retry ? [toRetryMiddleware(endpointOptions.retry)] : [];
  return [...(sourceMiddleware ?? []), ...retry, ...(endpointOptions?.middleware ?? [])];
}

/** Express a declared retry policy as the middleware that carries it out. */
function toRetryMiddleware(retry: RetryOptions): Middleware {
  const statuses = retry.on;
  return retryMiddleware({
    ...(retry.attempts !== undefined && { limit: retry.attempts }),
    ...(retry.backoff !== undefined && { mode: retry.backoff }),
    ...(statuses?.length && {
      retryOn: (response: MiddlewareResponse) => statuses.includes(response.status),
    }),
  });
}

/**
 * Apply the endpoint's timeout unless the call named one of its own.
 *
 * A value passed at the call site is the most specific and wins, then the
 * endpoint's own, then the caller's default — which used to be written into
 * the call's options and so beat the endpoint's.
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
  if (baseOptions.timeout !== undefined) return baseOptions;
  const timeout = endpointOptions?.timeout ?? callerDefault;
  return timeout === undefined ? baseOptions : { ...baseOptions, timeout };
}

/**
 * Stop the upstream call when the caller of the proxy goes away.
 *
 * A proxied request used to run to completion after its client had left —
 * a closed tab, a cancelled query — so a busy page held upstream connections
 * nobody was waiting for. The incoming request's signal now joins whatever
 * signal the call already carries.
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
  const own = baseOptions.signal;
  return { ...baseOptions, signal: own ? AbortSignal.any([own, request.signal]) : request.signal };
}
