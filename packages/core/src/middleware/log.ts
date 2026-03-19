import { defineMiddleware } from "./compose";
import type { Middleware } from "./types";

/**
 * Logging middleware — logs endpoint, status, and duration.
 *
 * @example
 * defineApi({
 *   middleware: [logMiddleware()],
 *   groups: { ... },
 * })
 */
export function logMiddleware(options?: {
  /** Custom logger function (default: console.log) */
  logger?: (message: string) => void;
}): Middleware {
  const { logger = console.log } = options ?? {};

  return defineMiddleware("log", "wrap", async (ctx, next) => {
    const label = [ctx.source, ctx.group, ctx.method].filter(Boolean).join(":");
    const start = performance.now();

    try {
      const response = await next();
      const ms = Math.round(performance.now() - start);
      logger(`${label} → ${response.status} (${ms}ms)`);
      return response;
    } catch (error) {
      const ms = Math.round(performance.now() - start);
      logger(`${label} → ERROR (${ms}ms)`);
      throw error;
    }
  });
}
