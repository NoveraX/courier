import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { MockServerOptions } from "./mock-server-types";
import type { MockLogMode } from "./request-logger";
import { createRequestLogger } from "./request-logger";

/**
 * Install the middleware every mock server runs: the request logger at the
 * level `log` sets, and CORS unless it is switched off.
 *
 * @param app    The mock server's Hono app
 * @param config The server's options
 * @returns Nothing; the middleware is added to `app`
 * @example
 * ```ts
 * applyMiddleware(app, { log: "silent", cors: { origin: "http://localhost:5173" } });
 * ```
 */
export function applyMiddleware(app: Hono, config: MockServerOptions | undefined): void {
  app.use("*", createRequestLogger(logLevelOf(config?.log)));
  if (config?.cors === false) return;
  const origin = typeof config?.cors === "object" ? config.cors.origin : "*";
  app.use("*", cors({ origin }));
}

function logLevelOf(log?: MockLogMode | boolean): MockLogMode {
  if (log === true) return "normal";
  if (log === false) return "silent";
  return log ?? "normal";
}
