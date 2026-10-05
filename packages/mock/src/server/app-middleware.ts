import type { Context, Hono, Next } from "hono";
import { cors } from "hono/cors";

import type { MockServerOptions } from "./mock-server-types";
import type { MockLogMode } from "./request-logger";
import { createRequestLogger } from "./request-logger";

/**
 * Install the middleware every mock server runs: the request logger at the
 * level `log` sets, and CORS unless it is switched off. CORS answers a
 * browser's preflight itself; an OPTIONS that is not one asks an endpoint
 * what it allows, and reaches the endpoint the source declares.
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
  const answerCors = cors({ origin });
  app.use("*", (c, next) =>
    c.req.method === "OPTIONS" && !c.req.header("access-control-request-method")
      ? passOptions(c, next, origin)
      : answerCors(c, next),
  );
}

/* A plain OPTIONS goes on to its route, and its answer names the origins CORS allows. */
async function passOptions(c: Context, next: Next, allowed: string | string[]): Promise<void> {
  await next();
  const origin = c.req.header("origin") ?? "";
  if (allowed === "*") c.header("Access-Control-Allow-Origin", "*");
  else if ((typeof allowed === "string" ? [allowed] : allowed).includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin", { append: true });
  }
}

function logLevelOf(log?: MockLogMode | boolean): MockLogMode {
  if (log === true) return "normal";
  if (log === false) return "silent";
  return log ?? "normal";
}
