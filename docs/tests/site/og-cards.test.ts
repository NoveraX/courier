/**
 * The social cards the site draws: one for every page but the home page,
 * which draws its own, each set in Geist with its text cut to fit.
 */
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

import { ogImagePath } from "@/site/seo/og-image"
import { clipText, headlineSize } from "@/site/seo/og-text"

/* The cards read the pages and the fonts from where the site is built, which their modules
   take from the working directory as they load. */
const cwd = vi
  .spyOn(process, "cwd")
  .mockReturnValue(fileURLToPath(new URL("../..", import.meta.url)))
const { docSlugs } = await import("@/site/content/docs-files")
const { EXAMPLE_PAGES } = await import("@/site/sandbox/example-pages")
const { ogCard } = await import("@/site/seo/og-card")
const { pageCards } = await import("@/site/seo/page-cards")
const { SITE_PAGES } = await import("@/site/seo/site-pages")
cwd.mockRestore()

describe("a card's text", () => {
  it("is kept whole when it fits, and cut on a word with an ellipsis when it does not", () => {
    expect(clipText("Install it.", 20)).toBe("Install it.")
    expect(clipText("Install the package and define an API", 20)).toBe("Install the package…")
    expect(clipText("Define it, then call it", 11)).toBe("Define it…")
    expect(clipText("createProxyQueryCaller", 10)).toBe("createProx…")
  })

  it("sets a short headline large and a long one smaller", () => {
    expect(headlineSize("Quick Start")).toBe(84)
    expect(headlineSize("Advanced React Query Patterns")).toBe(72)
    expect(headlineSize("A title much longer than any the docs give a page")).toBe(60)
  })
})

describe("the cards", () => {
  const cards = pageCards()

  it("are drawn for every page whose metadata names one, and the home page draws its own", () => {
    const pages = [
      ...docSlugs().map((slug) => `/docs/${slug.join("/")}`),
      ...Object.keys(EXAMPLE_PAGES).map((name) => `/docs/examples/${name}`),
      SITE_PAGES.studio.path,
      SITE_PAGES.mcp.path,
      SITE_PAGES.reference.path,
    ]
    expect(pages.length).toBeGreaterThan(100)
    expect([...cards.keys()].sort()).toEqual(pages.sort())
    expect(ogImagePath("/")).toBe("/opengraph-image")
    expect(ogImagePath("/docs/quick-start")).toBe("/og/docs/quick-start")
  })

  it("say each page's section, title and what it covers", () => {
    expect(cards.get("/docs/quick-start")).toMatchObject({
      eyebrow: "Getting Started",
      headline: "Quick Start",
    })
    expect(cards.get("/docs/examples/streaming")?.eyebrow).toBe("Examples")
    for (const [href, card] of cards) {
      expect(card.eyebrow && card.headline && card.description, href).toBeTruthy()
    }
  })

  it("render as PNG images, set in the site's fonts", async () => {
    const card = cards.get("/docs/quick-start")
    if (!card) throw new Error("The quick start has no card")
    const response = await ogCard(card, "/docs/quick-start")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(response.headers.get("content-type")).toBe("image/png")
    expect([...bytes.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG")
  })
})
