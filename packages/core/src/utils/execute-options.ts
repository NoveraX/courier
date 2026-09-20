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
 * A value passed at the call site is the more specific of the two and wins.
 */
export function withEndpointTimeout<T extends Partial<BoundMethodOptions>>(
  baseOptions: T,
  endpointOptions: ResolvedEndpointOptions | undefined,
): T {
  if (endpointOptions?.timeout === undefined || baseOptions.timeout !== undefined) {
    return baseOptions;
  }
  return { ...baseOptions, timeout: endpointOptions.timeout };
}
