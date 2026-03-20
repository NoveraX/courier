import type {
  AfterHandler,
  BeforeHandler,
  Middleware,
  MiddlewarePhase,
  WrapHandler,
} from "./types";

/**
 * Define a typed middleware with explicit phase.
 *
 * @param name - Middleware name shown in DevTools
 * @param phase - "before" (pre-fetch), "after" (post-fetch), "wrap" (both)
 * @param handler - Phase-specific handler function
 *
 * @example
 * const auth = defineMiddleware("auth", "before", async (ctx) => {
 *   ctx.headers.set("Authorization", `Bearer ${token}`);
 * });
 *
 * @example
 * const logger = defineMiddleware("logger", "wrap", async (ctx, next) => {
 *   const t0 = Date.now();
 *   const res = await next();
 *   console.log(`${ctx.method} took ${Date.now() - t0}ms`);
 *   return res;
 * });
 */
export function defineMiddleware(name: string, phase: "before", handler: BeforeHandler): Middleware;
export function defineMiddleware(name: string, phase: "after", handler: AfterHandler): Middleware;
export function defineMiddleware(name: string, phase: "wrap", handler: WrapHandler): Middleware;
export function defineMiddleware(
  name: string,
  phase: MiddlewarePhase,
  handler: BeforeHandler | AfterHandler | WrapHandler,
): Middleware {
  return { name, phase, handler } as Middleware;
}
