import { defineOwn } from "../utils/define-own";
import { sentHeaderValue } from "../utils/header-value";
import { isRecord } from "../utils/is-record";
import { ValidationError } from "../validation";
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
 * browser sends no such header itself. A value no header carries — a
 * control character other than a tab, or a character past U+00FF — fails
 * the call's variables, as one that fails their schema does: a
 * `ValidationError` naming the variable, `422` through the proxy, with
 * nothing sent and the value not repeated.
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
      if (!headers.has(name)) defineOwn(rest, name, value);
      else if (value !== undefined && value !== null)
        ctx.headers.set(name, headerValue(name, value));
    }
    ctx.variables = rest;
  });
}

function headerValue(name: string, value: unknown): string {
  const sent = sentHeaderValue(headerText(value));
  if (sent !== undefined) return sent;
  throw new ValidationError("variables", [
    {
      message:
        "Cannot be sent as a header: it holds a control character other than a tab, or one past U+00FF",
      path: [name],
    },
  ]);
}

function headerText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(",");
  if (isRecord(value)) return Object.entries(value).flat().map(String).join(",");
  return String(value);
}
