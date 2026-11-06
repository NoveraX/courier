/**
 * The live examples' pages answer only a browser that opens one: a page
 * another site loads as an image, a script, a frame or a fetch is refused
 * before it renders — and calls the examples' backend on no visitor's
 * budget — while a link from another site still opens it, and so does
 * every load from the site itself or from a browser that sends no Fetch
 * Metadata.
 */
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { config, proxy } from "@/proxy"

function load(fetchMetadata: Record<string, string>, page = "/docs/examples/direct"): Response {
  return proxy(new NextRequest(`https://courier.localhost${page}`, { headers: fetchMetadata }))
}

/* Whether the proxy sends the request on to the page it asked for. */
const opens = (response: Response) => response.headers.get("x-middleware-next") === "1"

describe("an example page", () => {
  it.each(["image", "script", "style", "iframe", "object", "empty", "worker"])(
    "another site loads as %s is refused before it renders",
    async (dest) => {
      const refused = load({ "sec-fetch-site": "cross-site", "sec-fetch-dest": dest })
      expect(refused.status).toBe(403)
      expect(refused.headers.get("cache-control")).toBe("no-store")
      expect(await refused.text()).toBe("The live examples open as pages of their own")
    }
  )

  it("opens from another site's link, and for the site's own loads of any kind", () => {
    expect(opens(load({ "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" }))).toBe(true)
    expect(opens(load({ "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty" }))).toBe(true)
    expect(opens(load({ "sec-fetch-site": "same-site", "sec-fetch-dest": "iframe" }))).toBe(true)
    expect(opens(load({ "sec-fetch-site": "none", "sec-fetch-dest": "document" }))).toBe(true)
  })

  it("opens for a browser that sends no Fetch Metadata", () => {
    expect(opens(load({}))).toBe(true)
  })

  it("is the only page held to it: another site loads a docs page as it likes", () => {
    const docsPage = load(
      { "sec-fetch-site": "cross-site", "sec-fetch-dest": "image" },
      "/docs/quick-start"
    )
    expect(opens(docsPage)).toBe(true)
    expect(config.matcher).toBe("/docs/:path*")
  })
})
