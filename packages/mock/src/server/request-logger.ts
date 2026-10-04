import { createLogger } from "@noverax/courier";
import type { MiddlewareHandler } from "hono";

const log = createLogger("MockServer");

/**
 * How much of its traffic a mock server logs: nothing, every request except
 * its own admin API (`normal`), or every request (`verbose`).
 */
export type MockLogMode = "silent" | "normal" | "verbose";

/**
 * Create a Hono middleware that logs one line per request — method, path,
 * status and duration, `GET /users → 404 (3ms)`, the shape of the log
 * middleware's lines.
 *
 * The line is plain text; where the terminal shows colour the logger tints
 * its status by class and lines up the paths, and a log file or pipe gets
 * no escape codes.
 *
 * @param mode - Which requests to log
 * @returns The middleware
 * @example
 * ```ts
 * app.use("*", createRequestLogger("normal"));
 * ```
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
    log.info(`${c.req.method} ${path} → ${c.res.status} (${duration}ms)`);
  };
}
