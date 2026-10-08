import { ensureCsrfToken, type RelayedCookie } from "@noverax/courier";
import type { AnyDefinedApi } from "@noverax/courier/define";
import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import type { NextResponse } from "next/server.js";

import { nextCookieOf } from "./next-cookie";

/** The double-submit tokens a middleware asked the APIs for, to hand on. */
export interface HandedCsrfTokens {
  /** The request's headers, its `Cookie` carrying the tokens, for the page that renders it */
  readonly headers: Headers;
  /**
   * Hand the tokens to the browser on the response, and to the page that
   * renders the request through Next.js's own cookies.
   */
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

/* Next.js 14 and 15 give the page the request's own headers, a middleware's in their place. */
function carrying(given: Headers, handed: readonly RelayedCookie[]): Headers {
  const headers = new Headers(given);
  if (handed.length === 0) return headers;
  const added = handed.map(({ cookie }) => `${cookie.name}=${cookie.value}`);
  headers.set("cookie", [given.get("cookie"), ...added].filter(Boolean).join("; "));
  return headers;
}

/* Through the response's own cookies, which Next.js 16 also gives the page that renders; one
   whose value Next.js would write changed goes byte for byte, to the browser alone. */
function handOn(response: NextResponse, handed: readonly RelayedCookie[]): NextResponse {
  for (const relayed of handed) {
    const cookie = nextCookieOf(relayed);
    if (cookie === undefined) response.headers.append("set-cookie", relayed.header);
    else response.cookies.set(cookie);
  }
  return response;
}
