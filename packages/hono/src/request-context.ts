import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import type { Context, MiddlewareHandler } from "hono";

import { peerAddressOf } from "./peer-address";

/**
 * Hono middleware that serves the rest of each request with its session and
 * headers at hand: every call a route, a service or a background step it
 * awaits makes takes them from the request — for the APIs that keep a
 * `session` or `forward` headers — and the session cookies the API sets
 * reach the browser on the response the route answers with, beside the
 * route's own.
 *
 * It keeps the request in `AsyncLocalStorage`, which Node, Bun and Deno
 * provide, and Cloudflare Workers with the `nodejs_compat` flag. The user's
 * address is the connection's, where the runtime reports one, after the
 * chain a proxy on a private network recorded.
 *
 * @returns The middleware
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { requestContext } from "@noverax/courier-hono/request-context";
 *
 * const app = new Hono();
 * app.use(requestContext());
 * app.get("/account", async (c) => c.json(await api.users.me()));
 * ```
 */
export function requestContext(): MiddlewareHandler {
  return async (c, next) => {
    const cookies: string[] = [];
    let answered = false;
    const incoming = webIncomingRequest(c.req.raw, {
      peerAddress: peerAddressOf(c),
      setCookie: ({ header }) => {
        if (answered) return "the response had already been handed back";
        cookies.push(header);
        return true;
      },
    });
    await withIncomingRequest(incoming, next);
    answered = true;
    if (cookies.length > 0) addCookies(c, cookies);
  };
}

function addCookies(c: Context, cookies: readonly string[]): void {
  try {
    for (const cookie of cookies) c.res.headers.append("set-cookie", cookie);
  } catch {
    /* Its headers are immutable — a route answered with what `fetch` returned —
       so the copy Hono makes of it carries them. */
    c.res = new Response(c.res.body, c.res);
    for (const cookie of cookies) c.res.headers.append("set-cookie", cookie);
  }
}
