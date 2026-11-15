import type { AnyDefinedApi } from "@noverax/courier/define";
import { cookieHeaderAfter } from "@noverax/courier/internal";
import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import { ensureCsrfToken, type RelayedCookie } from "@noverax/courier/server";
import type { NextResponse } from "next/server.js";

/** The double-submit tokens a middleware asked the APIs for, to hand on. */
export interface HandedCsrfTokens {
  /**
   * The request's headers for the page that renders it, to pass on with
   * `NextResponse.next({ request: { headers } })`: its `Cookie` as the APIs
   * left it, carrying the tokens, and a session cookie one renewed in place
   * of the one the request had
   */
  readonly headers: Headers;
  /** Hand the tokens to the browser on the response, each cookie as the API wrote it. */
  handTo(response: NextResponse): NextResponse;
}

/**
 * Ask each API for the user's double-submit token where the request does
 * not carry it — once, with the user's session, through the API's
 * middleware — for a Next.js middleware of the application's own to hand
 * on, to the browser and to the page that renders the request, which a
 * page cannot set cookies for while it renders. `csrfTokenMiddleware` is
 * the middleware ready made.
 *
 * @param request - The request the middleware is given
 * @param apis - The APIs whose `session.csrf.from` names where each hands its token out
 * @returns The request's headers carrying the tokens, and what hands them on
 * @example
 * ```ts
 * const tokens = await handCsrfTokens(request, api);
 * return tokens.handTo(NextResponse.next({ request: { headers: tokens.headers } }));
 * ```
 */
export async function handCsrfTokens(
  request: Request,
  ...apis: AnyDefinedApi[]
): Promise<HandedCsrfTokens> {
  const handed: RelayedCookie[] = [];
  const incoming = webIncomingRequest(request, {
    setCookie: (cookie) => {
      handed.push(cookie);
      return true;
    },
  });
  await withIncomingRequest(incoming, async () => {
    for (const api of apis) await ensureCsrfToken(api);
  });
  return {
    headers: carrying(request.headers, handed),
    handTo: (response) => handOn(response, handed),
  };
}

/* Every Next.js gives the page the request's headers, a middleware's in their place: its cookies
   as the calls made for the request see them, each the API set in place of every one of its name
   the request had, and one the API ended gone. */
function carrying(given: Headers, handed: readonly RelayedCookie[]): Headers {
  const headers = new Headers(given);
  if (handed.length === 0) return headers;
  const cookie = cookieHeaderAfter(
    given.get("cookie"),
    handed.map((relayed) => relayed.cookie),
  );
  if (cookie === "") headers.delete("cookie");
  else headers.set("cookie", cookie);
  return headers;
}

/* Byte for byte, never through Next.js's cookie API: a cookie set there has Next.js rewrite the
   `Cookie` the page reads, every value URL-encoded, a session cookie's among them. */
function handOn(response: NextResponse, handed: readonly RelayedCookie[]): NextResponse {
  for (const { header } of handed) response.headers.append("set-cookie", header);
  return response;
}
