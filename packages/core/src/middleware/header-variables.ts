import { defineOwn } from "../utils/define-own";
import { sentHeaderValue } from "../utils/header-value";
import { isRecord } from "../utils/is-record";
import { simpleTexts } from "../utils/simple-style";
import { ValidationError } from "../validation";
import { defineMiddleware } from "./define";
import type { Middleware } from "./types";

/* Why a file is refused where a header would carry it. */
const HEADER_HOLDS_TEXT = "a header holds text; send a file in the body";

/**
 * Send some of a call's variables as request headers instead of in its path,
 * query or body: an API's header parameters, such as a digest or a version
 * chosen per call. The variables are validated whole first; the named ones
 * are then taken out and set as headers, and one left unset is not sent.
 *
 * A list is written comma-separated and an object as its keys and values in
 * turn, as OpenAPI's `simple` style writes a header, each value as JSON
 * writes it, its `toJSON` asked first: a date is its ISO string, so a direct
 * call sends what a call through the proxy does, and a value JSON writes as
 * `null` or leaves out sends no header. A file, a `Set`, a `Map` or a
 * `BigInt` is refused with a `ConfigurationError` whose `code` is
 * `VARIABLE_NOT_ENCODABLE`, before anything is sent. It runs where the call
 * is made: for a call through the proxy, in the
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
      if (!headers.has(name)) {
        defineOwn(rest, name, value);
        continue;
      }
      const text = simpleTexts(name, value, HEADER_HOLDS_TEXT)?.join(",");
      if (text !== undefined) ctx.headers.set(name, headerValue(name, text));
    }
    ctx.variables = rest;
  });
}

function headerValue(name: string, text: string): string {
  const sent = sentHeaderValue(text);
  if (sent !== undefined) return sent;
  throw new ValidationError("variables", [
    {
      message:
        "Cannot be sent as a header: it holds a control character other than a tab, or one past U+00FF",
      path: [name],
    },
  ]);
}
