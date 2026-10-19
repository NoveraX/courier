import type { Metadata } from "next"

import { DOCS_TITLE_SUFFIX, SITE_LOCALE, SITE_NAME } from "./site-identity"

/** What a page says of itself to search engines and to the sites it is shared on. */
export interface SeoPage {
  /** The page's address, which is also its canonical URL. */
  path: string
  /** The page's own title. */
  title: string
  description: string
  /** Whether the title is shown as written, without the docs' suffix: a landing page's is. */
  standalone?: boolean | undefined
  /** The docs section the page belongs to, for a docs page. */
  section?: string | undefined
}

/* Every page shares the site's card until it is drawn one of its own. */
const SHARED_CARD = "/opengraph-image"

function fullTitle({ title, standalone }: SeoPage): string {
  return standalone ? title : `${title} — ${DOCS_TITLE_SUFFIX}`
}

/* The home page's card is its own image file, which Next.js names with its hash when no
   card is set here. */
function images(page: SeoPage) {
  if (page.path === "/") return {}
  return { images: [{ url: SHARED_CARD, width: 1200, height: 630, alt: fullTitle(page) }] }
}

function openGraph(page: SeoPage): NonNullable<Metadata["openGraph"]> {
  const shared = {
    url: page.path,
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    title: fullTitle(page),
    description: page.description,
    ...images(page),
  }
  return page.section
    ? { ...shared, type: "article", section: page.section }
    : { ...shared, type: "website" }
}

/**
 * A page's metadata: its title and description, its canonical URL, and
 * everything Open Graph and X read when the page is shared — written in
 * full for each page, since a page's Open Graph replaces the layout's
 * rather than adding to it.
 *
 * @param page - What the page says of itself
 * @returns The page's metadata
 * @example
 * ```ts
 * export const metadata = pageMetadata({ path: "/docs/quick-start", title: "Quick Start", description: "…" })
 * ```
 */
export function pageMetadata(page: SeoPage): Metadata {
  return {
    title: page.standalone ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: openGraph(page),
    twitter: { card: "summary_large_image", title: fullTitle(page), description: page.description },
  }
}
