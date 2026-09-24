import { createLogger } from "@noverax/courier";
import type { MiddlewareHandler } from "hono";

const log = createLogger("MockServer");

/**
 * How much of its traffic a mock server logs: nothing, every request except
 * its own admin API (`normal`), or every request (`verbose`).
 */
export type MockLogMode = "silent" | "normal" | "verbose";

/**
 * Create a Hono middleware that logs one line per request: status, method,
 * path and duration.
 *
 * The line is plain text; the logger colours its prefix where the terminal
 * shows colour, and a log file or pipe gets no escape codes.
 *
 * @param mode - Which requests to log
 * @returns The middleware
 */
export function createRequestLogger(mode: MockLogMode): MiddlewareHandler {
  if (mode === "silent") {
    return async (_c, next) => next();
  }

  return async (c, next) => {
    const start = performance.now();
    await next();
    const path = new URL(c.req.url).pathname;
    if (mode === "normal" && path.startsWith("/__admin")) return;
    const duration = Math.round(performance.now() - start);
    log.info(`${c.res.status} ${c.req.method} ${path} ${duration}ms`);
  };
}
