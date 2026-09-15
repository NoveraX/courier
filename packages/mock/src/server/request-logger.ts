import { createLogger } from "@noverax/courier";
import type { MiddlewareHandler } from "hono";

const log = createLogger("MockServer");

export type LogLevel = "silent" | "normal" | "verbose";

/** Create a Hono middleware that logs requests with status color coding */
export function createRequestLogger(level: LogLevel): MiddlewareHandler {
  if (level === "silent") {
    return async (_c, next) => next();
  }

  return async (c, next) => {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);
    const status = c.res.status;
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    const statusColor = status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
    const reset = "\x1b[0m";

    if (level === "verbose") {
      log.info(`${statusColor}${status}${reset} ${method} ${path} ${duration}ms`);
    } else {
      // Normal: skip admin routes
      if (!path.startsWith("/__admin")) {
        log.info(`${statusColor}${status}${reset} ${method} ${path} ${duration}ms`);
      }
    }
  };
}
