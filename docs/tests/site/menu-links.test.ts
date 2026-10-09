/**
 * The landing pages' menu on a narrow screen: the same places from the
 * library's page and from each product's page, and from a product's page
 * the way back to the library, last — after the links, as in the header.
 */
import { describe, expect, it } from "vitest"

import { LIBRARY_LINK, MENU_LINKS, menuLinksFor } from "@/site/landing/header/menu-links"

describe("the landing pages' menu", () => {
  it("leads from the library's page to the products, the docs, the frameworks and the reference, not back to itself", () => {
    const links = menuLinksFor("/")

    expect(links.map((link) => link.href)).toEqual([
      "/studio",
      "/mcp",
      "/docs/introduction",
      "/docs/frameworks/overview",
      "/reference",
    ])
    expect(links.some((link) => link.href === "/")).toBe(false)
  })

  it("leads from each product's page to the same places, its own included, and back to the library last", () => {
    for (const page of ["/studio", "/mcp"] as const) {
      const links = menuLinksFor(page)

      expect(links.slice(0, -1)).toEqual(MENU_LINKS)
      expect(links.at(-1)).toBe(LIBRARY_LINK)
      expect(links.filter((link) => link.href === page)).toHaveLength(1)
    }
    expect(LIBRARY_LINK).toMatchObject({ label: "Courier library", href: "/" })
  })
})
