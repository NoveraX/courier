/**
 * The page an address with no page shows: titled so, and leading only to
 * pages the site serves.
 */
import { describe, expect, it } from "vitest"

import { metadata } from "@/app/not-found"
import { flatNavItems } from "@/site/content/docs-nav"
import { NOT_FOUND_PLACES } from "@/site/layout/not-found-content"
import { SITE_PAGES } from "@/site/seo/site-pages"

describe("the not-found page", () => {
  it("is titled so, under the docs' title template", () => {
    expect(metadata.title).toBe("Page not found")
  })

  it("leads only to pages the site serves", () => {
    const served = new Set([
      ...flatNavItems().map((item) => item.href),
      ...Object.values(SITE_PAGES).map((page) => page.path),
    ])
    expect(NOT_FOUND_PLACES.length).toBeGreaterThan(0)
    for (const { href } of NOT_FOUND_PLACES) expect(served, href).toContain(href)
  })
})
