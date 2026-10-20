import type { MetadataRoute } from "next"

import { docSlugs, docSource } from "@/site/content/docs-files"
import { docsNav, flatNavItems } from "@/site/content/docs-nav"
import { type LegalPage, legalUpdated } from "@/site/content/legal-files"
import { API_SECTION } from "@/site/content/nav-reference"
import { sourceMetadata } from "@/site/content/source-metadata"
import { referenceUpdated } from "@/site/reference/reference-updated"
import { EXAMPLE_PAGES } from "@/site/sandbox/example-pages"
import { SITE_PAGES } from "./site-pages"
import { absoluteUrl } from "./structured-data/json-ld-node"

function docsPages(): MetadataRoute.Sitemap {
  const pages = docSlugs().map((slug) => {
    const href = `/docs/${slug.join("/")}`
    const updated = sourceMetadata(docSource(slug) ?? "").updated
    return { url: absoluteUrl(href), ...(updated ? { lastModified: updated } : {}) }
  })
  /* In the navigation's order, which a reader goes through them in. */
  const order = flatNavItems().map((item) => absoluteUrl(item.href))
  const rank = (url: string) => (order.includes(url) ? order.indexOf(url) : order.length)
  return pages.sort((a, b) => rank(a.url) - rank(b.url))
}

function referencePage(): MetadataRoute.Sitemap[number] {
  const api = docsNav.find((section) => section.label === API_SECTION)?.items ?? []
  const updated = referenceUpdated(api.map((item) => item.href))
  return {
    url: absoluteUrl(SITE_PAGES.reference.path),
    ...(updated ? { lastModified: updated } : {}),
  }
}

function legalPage(name: LegalPage): MetadataRoute.Sitemap[number] {
  const updated = legalUpdated(name)
  return { url: absoluteUrl(SITE_PAGES[name].path), ...(updated ? { lastModified: updated } : {}) }
}

/**
 * The site's sitemap: every page by its canonical address — the landing
 * pages, the API reference, every docs page, every example and the legal
 * pages — each with
 * the day its text last changed when the page says, and no date otherwise:
 * a search engine trusts the dates of a sitemap only while they are true.
 *
 * @returns The entries
 * @example
 * ```ts
 * sitemapEntries().find((entry) => entry.url.endsWith("/docs/quick-start"))?.lastModified // "2026-10-14"
 * ```
 */
export function sitemapEntries(): MetadataRoute.Sitemap {
  const landing = [SITE_PAGES.home, SITE_PAGES.studio, SITE_PAGES.mcp]
  return [
    ...landing.map((page) => ({ url: absoluteUrl(page.path) })),
    referencePage(),
    ...docsPages(),
    ...Object.keys(EXAMPLE_PAGES).map((name) => ({ url: absoluteUrl(`/docs/examples/${name}`) })),
    legalPage("privacy"),
    legalPage("consent"),
  ]
}
