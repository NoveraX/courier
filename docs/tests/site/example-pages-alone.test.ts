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

function load(fetchMetadata: Record<string, string>): Response | undefined {
  return proxy(
    new NextRequest("https://courier.localhost/docs/examples/direct", { headers: fetchMetadata })
  )
}

describe("an example page", () => {
  it.each(["image", "script", "style", "iframe", "object", "empty", "worker"])(
    "another site loads as %s is refused before it renders",
    async (dest) => {
      const refused = load({ "sec-fetch-site": "cross-site", "sec-fetch-dest": dest })
      expect(refused?.status).toBe(403)
      expect(refused?.headers.get("cache-control")).toBe("no-store")
      expect(await refused?.text()).toBe("The live examples open as pages of their own")
    }
  )

  it("opens from another site's link, and for the site's own loads of any kind", () => {
    expect(load({ "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" })).toBeUndefined()
    expect(load({ "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty" })).toBeUndefined()
    expect(load({ "sec-fetch-site": "same-site", "sec-fetch-dest": "iframe" })).toBeUndefined()
    expect(load({ "sec-fetch-site": "none", "sec-fetch-dest": "document" })).toBeUndefined()
  })

  it("opens for a browser that sends no Fetch Metadata", () => {
    expect(load({})).toBeUndefined()
  })

  it("holds the live examples' pages to it, and no other", () => {
    expect(config.matcher).toBe("/docs/examples/:path*")
  })
})
