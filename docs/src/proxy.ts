import { type NextRequest, NextResponse } from "next/server"

import { prefersMarkdown } from "@/site/content/markdown-preference"

/* What a browser loads a page as when it opens it: a link followed, an address typed. */
const OPENED = "document"
/* The live examples' pages, which run only in a browser: no Markdown of them is written. */
const EXAMPLES = "/docs/examples/"

/**
 * The request header that marks a request for a docs page as asking for
 * its Markdown, which next.config rewrites to the page's Markdown route.
 * Only the proxy sets it: a request's own is removed before it is read.
 */
export const MARKDOWN_ASKED = "x-docs-markdown"

/* The Markdown at a page's own address depends on the request's Accept, and no shared cache
   keeps it, so none that disregards Vary hands it to a browser. */
const MARKDOWN_ANSWER = { vary: "Accept", "cache-control": "private, no-cache" }

/* A live example's page another site loads as anything but a page: refused before it renders. */
function exampleRefusal(request: NextRequest): Response | undefined {
  const site = request.headers.get("sec-fetch-site")
  const dest = request.headers.get("sec-fetch-dest")
  if (site !== "cross-site" || dest === null || dest === OPENED) return undefined
  return new Response("The live examples open as pages of their own", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })
}

/**
 * The docs' pages, as their requests ask for them.
 *
 * - A request for a docs page written as text whose `Accept` asks for
 *   Markdown — as nextjs.org reads it — is marked for next.config to
 *   answer with the page's Markdown, the same its address with `.md` after
 *   it serves, which says it varies by `Accept` and stays out of shared
 *   caches. The proxy does not rewrite it itself: a rewrite from here names
 *   its target by an absolute address, which Next.js takes for another
 *   server's when the site listens on a loopback address, and fetches over
 *   the network with that answer's headers.
 * - A live example's page answers only a browser that opens one: a page
 *   another site loads as an image, a script, a frame or a fetch is
 *   refused before it renders, as the Fetch Metadata the browser sends
 *   says, since rendering it would call the examples' backend on the
 *   budget of the visitor whose browser that site drives. A link from
 *   another site still opens it, and a browser that sends no Fetch
 *   Metadata is served as before.
 *
 * @param request - A request for a docs page
 * @returns The answer, or the request to send on to the page
 * @example
 * ```ts
 * proxy(request) // marked for the page's Markdown, for `Accept: text/markdown`
 * ```
 */
export function proxy(request: NextRequest): Response {
  const { pathname } = request.nextUrl
  const headers = new Headers(request.headers)
  headers.delete(MARKDOWN_ASKED)
  if (pathname.startsWith(EXAMPLES)) {
    return exampleRefusal(request) ?? NextResponse.next({ request: { headers } })
  }
  if (pathname.endsWith(".md") || !prefersMarkdown(request.headers.get("accept"))) {
    return NextResponse.next({ request: { headers } })
  }
  headers.set(MARKDOWN_ASKED, "1")
  return NextResponse.next({ request: { headers }, headers: MARKDOWN_ANSWER })
}

export const config = { matcher: "/docs/:path*" }
