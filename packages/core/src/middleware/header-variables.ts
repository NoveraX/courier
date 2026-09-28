import { isRecord } from "../utils/is-record";
import { defineMiddleware } from "./define";
import type { Middleware } from "./types";

/**
 * Send some of a call's variables as request headers instead of in its path,
 * query or body: an API's header parameters, such as a digest or a version
 * chosen per call. The variables are validated whole first; the named ones
 * are then taken out and set as headers, and one left unset is not sent.
 *
 * A list is written comma-separated and an object as its keys and values in
 * turn, as OpenAPI's `simple` style writes a header; anything else as text.
 * It runs where the call is made: for a call through the proxy, in the
 * application's server, so the values travel with the variables and the
 * browser sends no such header itself.
 *
 * @param names - The variables to send as headers, each under its own name
 * @returns The middleware, for an endpoint's `.use()` or a source's `middleware`
 *
 * @example
 * ```ts
 * import { headerVariablesMiddleware } from "@noverax/courier/middleware";
 *
 * const find = endpoint
 *   .get("things")
 *   .variables<{ q: string; "X-Digest": string }>()
 *   .use(headerVariablesMiddleware(["X-Digest"]));
 * // GET /things?q=… with the header X-Digest
 * ```
 */
export function headerVariablesMiddleware(names: readonly string[]): Middleware {
  const headers = new Set(names);
  return defineMiddleware("header-variables", "before", (ctx) => {
    if (!isRecord(ctx.variables)) return;
    const rest: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(ctx.variables)) {
      if (!headers.has(name)) rest[name] = value;
      else if (value !== undefined && value !== null) ctx.headers.set(name, headerText(value));
    }
    ctx.variables = rest;
  });
}

function headerText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(",");
  if (isRecord(value)) return Object.entries(value).flat().map(String).join(",");
  return String(value);
}
