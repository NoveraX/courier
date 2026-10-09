/**
 * Where the landing pages' header and menu lead: the same places from the
 * library's page and from each product's page, the docs being the page's
 * own — the library's guides, or the product's — and from a product's page
 * the way back to the library, last, after the links as in the header.
 */
import { describe, expect, it } from "vitest"

import { documentationFor, LIBRARY_LINK, menuLinksFor } from "@/site/landing/header/menu-links"

describe("the landing pages' docs and menu", () => {
  it("leads from the library's page to the products, its guides, the frameworks and the reference, not back to itself", () => {
    const links = menuLinksFor("/")

    expect(links.map((link) => link.href)).toEqual([
      "/studio",
      "/mcp",
      "/docs/introduction",
      "/docs/frameworks/overview",
      "/reference",
    ])
    expect(documentationFor("/").href).toBe("/docs/introduction")
  })

  it("leads from each product's page to the product's own docs, not the library's guides", () => {
    expect(documentationFor("/studio")).toMatchObject({
      label: "Studio docs",
      href: "/docs/studio/overview",
    })
    expect(documentationFor("/mcp")).toMatchObject({
      label: "MCP server docs",
      href: "/docs/agents/overview",
    })
  })

  it("lists from a product's page the same places with its own docs, and the library last", () => {
    for (const page of ["/studio", "/mcp"] as const) {
      const links = menuLinksFor(page)

      expect(links.map((link) => link.href)).toEqual([
        "/studio",
        "/mcp",
        documentationFor(page).href,
        "/docs/frameworks/overview",
        "/reference",
        "/",
      ])
      expect(links.at(-1)).toBe(LIBRARY_LINK)
      expect(links.some((link) => link.href === "/docs/introduction")).toBe(false)
    }
    expect(LIBRARY_LINK).toMatchObject({ label: "Courier library", href: "/" })
  })
})
