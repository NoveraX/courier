import { docSlugs, docSource } from "@/site/content/docs-files"
import { findNavContext } from "@/site/content/docs-nav"
import { sourceMetadata } from "@/site/content/source-metadata"
import { EXAMPLE_PAGES } from "@/site/sandbox/example-pages"
import { SITE_PAGES } from "./site-pages"

/** What a page's social card says. */
export interface PageCard {
  /** The line above the headline: the page's section, or what the page is about. */
  eyebrow: string
  headline: string
  description: string
}

/**
 * The social card of every page the site draws one for, by address: the
 * docs pages under their section, the examples, the API reference and the
 * Studio and MCP pages. The home page draws its own.
 *
 * @returns The cards, by address
 * @example
 * ```ts
 * pageCards().get("/docs/quick-start")?.eyebrow // "Getting Started"
 * ```
 */
export function pageCards(): Map<string, PageCard> {
  const cards = new Map<string, PageCard>()
  for (const page of [SITE_PAGES.studio, SITE_PAGES.mcp, SITE_PAGES.reference]) {
    cards.set(page.path, { ...page.card, description: page.description })
  }
  for (const slug of docSlugs()) {
    const href = `/docs/${slug.join("/")}`
    const { title = "", description = "" } = sourceMetadata(docSource(slug) ?? "")
    const eyebrow = findNavContext(href)?.section.label ?? "Docs"
    cards.set(href, { eyebrow, headline: title, description })
  }
  for (const [name, { title, description }] of Object.entries(EXAMPLE_PAGES)) {
    cards.set(`/docs/examples/${name}`, { eyebrow: "Examples", headline: title, description })
  }
  return cards
}
