import { devtoolsHooks } from "../devtools";
import type { MiddlewareFn, MiddlewareResponse } from "./types";

/**
 * Define a typed middleware function.
 *
 * @example
 * const auth = defineMiddleware(async (ctx, next) => {
 *   ctx.headers.set("Authorization", `Bearer ${token}`);
 *   return next();
 * });
 */
export function defineMiddleware(fn: MiddlewareFn): MiddlewareFn {
  return fn;
}

/**
 * Compose multiple middleware into a single middleware function.
 * Middleware execute in array order: first is outermost (runs first on request, last on response).
 */
export function composeMiddleware(middlewares: MiddlewareFn[]): MiddlewareFn {
  if (middlewares.length === 0) {
    return (_ctx, next) => next();
  }

  const dt = devtoolsHooks;
  const totalCount = middlewares.length;

  return (ctx, next) => {
    function dispatch(i: number): Promise<MiddlewareResponse> {
      const fn = middlewares[i];
      if (!fn) return next();

      const name = fn.name || `middleware[${i}]`;
      const requestId = `${ctx.source}:${ctx.group ?? ""}:${ctx.method}`;

      dt.onMiddlewareEnter?.({
        requestId,
        name,
        index: i,
        totalCount,
        timestamp: performance.now(),
      });

      const t0 = dt.onMiddlewareExit ? performance.now() : 0;

      return fn(ctx, () => dispatch(i + 1)).then(
        (response) => {
          dt.onMiddlewareExit?.({
            requestId,
            name,
            index: i,
            duration: performance.now() - t0,
            timestamp: performance.now(),
          });
          return response;
        },
        (error) => {
          dt.onMiddlewareError?.({
            requestId,
            name,
            index: i,
            error: error instanceof Error ? error.message : String(error),
            timestamp: performance.now(),
          });
          throw error;
        },
      );
    }
    return dispatch(0);
  };
}
