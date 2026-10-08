import type { AnyDefinedApi } from "@noverax/courier/define";
import { type NextRequest, NextResponse } from "next/server.js";

import { handCsrfTokens } from "./hand-csrf-tokens";

/**
 * A Next.js middleware — `middleware.ts` in Next.js 14 and 15, `proxy.ts`
 * in Next.js 16 — that hands each API's double-submit token to the browser
 * with the page, where the request does not carry it: asked once, with the
 * user's session, and given to the page that renders the request too.
 *
 * A page cannot set cookies while it renders, so a token a write asks for
 * there reaches that render alone, and the next render asks again; handed
 * with the page, it is the browser's, and later renders and writes send it.
 * Match the pages that write while they render, or every page whose later
 * writes should find the token.
 *
 * @param apis - The APIs whose `session.csrf.from` names where each hands its token out
 * @returns The middleware
 * @example
 * ```ts
 * // proxy.ts (middleware.ts before Next.js 16)
 * import { csrfTokenMiddleware } from "@noverax/courier-next/middleware";
 * import { api } from "@/api";
 *
 * export const proxy = csrfTokenMiddleware(api);
 * export const config = { matcher: ["/account/:path*"] };
 * ```
 */
export function csrfTokenMiddleware(
  ...apis: AnyDefinedApi[]
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const tokens = await handCsrfTokens(request, ...apis);
    return tokens.handTo(NextResponse.next({ request: { headers: tokens.headers } }));
  };
}
