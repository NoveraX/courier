import type { NextRequest } from "next/server"

/* What a browser loads a page as when it opens it: a link followed, an address typed. */
const OPENED = "document"

/**
 * The live examples' pages answer only a browser that opens one. A page
 * another site loads as anything else — an image, a script, a frame, a
 * fetch — is refused before it renders, as the Fetch Metadata the browser
 * sends says: rendering it would call the examples' backend on the budget
 * of the visitor whose browser that site drives, and their examples would
 * be refused for a minute. A link from another site still opens a page,
 * and a browser that sends no Fetch Metadata is served as before.
 *
 * @param request - A request for one of the examples' pages
 * @returns 403 for one another site loads as no page, nothing for the rest
 * @example
 * ```ts
 * proxy(request) // 403 for <img src="https://courier.noverax.cloud/docs/examples/direct"> elsewhere
 * ```
 */
export function proxy(request: NextRequest): Response | undefined {
  const site = request.headers.get("sec-fetch-site")
  const dest = request.headers.get("sec-fetch-dest")
  if (site !== "cross-site" || dest === null || dest === OPENED) return undefined
  return new Response("The live examples open as pages of their own", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })
}

export const config = { matcher: "/docs/examples/:path*" }
