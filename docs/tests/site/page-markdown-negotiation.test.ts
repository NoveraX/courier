/**
 * A docs page answers a request that asks for Markdown with the Markdown
 * its address with `.md` after it serves: the site's proxy marks such a
 * request, next.config rewrites a marked one to the page's Markdown route,
 * and that answer says it varies by `Accept` and stays out of shared
 * caches. Only the proxy marks a request: one that marks itself is sent
 * on without it. A live example, which has no Markdown, and an address
 * that is Markdown already are sent on unmarked.
 */
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { config, MARKDOWN_ASKED, proxy } from "@/proxy"

import nextConfig from "../../next.config"

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

function ask(page: string, headers: Record<string, string>): Response {
  return proxy(new NextRequest(`https://courier.localhost${page}`, { headers }))
}

/* The request the proxy sends on, by the headers Next.js reads it from: whether it is marked, and
   whether it carries a header by that name at all. */
const marked = (response: Response) =>
  response.headers.get(`x-middleware-request-${MARKDOWN_ASKED}`) === "1"
const carries = (response: Response, header: string) =>
  (response.headers.get("x-middleware-override-headers") ?? "").split(",").includes(header)

describe("a docs page", () => {
  it("asked for as Markdown is marked for it, and answered out of shared caches", () => {
    const markdown = ask("/docs/core-concepts/caller", { accept: "text/markdown" })
    expect(markdown.headers.get("x-middleware-next")).toBe("1")
    expect(marked(markdown)).toBe(true)
    expect(markdown.headers.get("vary")).toBe("Accept")
    expect(markdown.headers.get("cache-control")).toBe("private, no-cache")
  })

  it("asked for by a browser is sent on unmarked, as Next.js answers it", () => {
    const page = ask("/docs/core-concepts/caller", { accept: BROWSER })
    expect(page.headers.get("x-middleware-next")).toBe("1")
    expect(marked(page)).toBe(false)
    expect(page.headers.get("vary")).toBeNull()
  })

  it("is not marked by a request that marks itself: the mark it sends is taken off", () => {
    for (const page of ["/docs/quick-start", "/docs/quick-start.md", "/docs/examples/basic"]) {
      const sent = ask(page, { accept: BROWSER, [MARKDOWN_ASKED]: "1" })
      expect(marked(sent), page).toBe(false)
      expect(carries(sent, MARKDOWN_ASKED), page).toBe(false)
    }
  })

  it("leaves a live example, and an address that is Markdown already, unmarked", () => {
    for (const page of ["/docs/examples/basic", "/docs/quick-start.md"]) {
      const sent = ask(page, { accept: "text/markdown" })
      expect(marked(sent), page).toBe(false)
      expect(sent.headers.get("vary"), page).toBeNull()
    }
  })

  it("marked is rewritten to its Markdown by next.config, at any address the proxy reads", async () => {
    const rewrites = await nextConfig.rewrites?.()
    const first = rewrites === undefined || Array.isArray(rewrites) ? [] : rewrites.beforeFiles
    expect(first).toEqual([
      {
        source: "/docs/:path+",
        has: [{ type: "header", key: MARKDOWN_ASKED, value: "1" }],
        destination: "/markdown/:path+",
      },
    ])
    expect(config.matcher).toBe("/docs/:path*")
  })
})
