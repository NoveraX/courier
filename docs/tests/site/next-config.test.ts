/**
 * What the site's Next.js config routes before any page: the docs' own
 * address, which redirects for good to the first page, and a docs page's
 * address with .md after it, which serves the page as Markdown.
 */
import { describe, expect, it } from "vitest"

import nextConfig from "../../next.config"

describe("the site's routing", () => {
  it("sends /docs to the introduction for good, so search engines index that page alone", async () => {
    expect(await nextConfig.redirects?.()).toContainEqual({
      source: "/docs",
      destination: "/docs/introduction",
      permanent: true,
    })
  })

  it("serves a docs page's Markdown at its own address with .md after it", async () => {
    expect(await nextConfig.rewrites?.()).toEqual([
      { source: "/docs/:path+.md", destination: "/markdown/:path+" },
    ])
  })
})
