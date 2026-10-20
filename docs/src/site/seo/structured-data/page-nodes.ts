import { ogImagePath } from "@/site/seo/og-image"
import { absoluteUrl, type JsonLdNode, nodeId, reference } from "./json-ld-node"
import { organizationNode, websiteNode } from "./site-nodes"

/** What a page's own node says of it. */
export interface PageFacts {
  path: string
  title: string
  description: string
  /** The node of what the page is about. */
  about: JsonLdNode
  /** The docs section the page belongs to, for a docs page. */
  section?: string | undefined
  /** When the page last changed, `YYYY-MM-DD`, for a page that says. */
  updated?: string | undefined
}

/**
 * A docs page as an article: its headline and description, its card, the
 * section it is in, when it last changed, and what it is about.
 *
 * @param page - The page
 * @returns The node
 * @example
 * ```ts
 * techArticleNode({ path: "/docs/quick-start", title: "Quick Start", description: "…", about })
 * ```
 */
export function techArticleNode(page: PageFacts): JsonLdNode {
  return {
    "@type": "TechArticle",
    "@id": nodeId(page.path, "article"),
    headline: page.title,
    description: page.description,
    url: absoluteUrl(page.path),
    mainEntityOfPage: absoluteUrl(page.path),
    image: absoluteUrl(ogImagePath(page.path)),
    inLanguage: "en",
    isPartOf: reference(websiteNode()),
    about: reference(page.about),
    author: reference(organizationNode()),
    publisher: reference(organizationNode()),
    ...(page.section ? { articleSection: page.section } : {}),
    ...(page.updated ? { dateModified: page.updated } : {}),
  }
}

/**
 * A landing or legal page: its name and description, its card, what it is
 * about, and when it last changed, for a page that says.
 *
 * @param page - The page
 * @returns The node
 * @example
 * ```ts
 * webPageNode({ path: "/studio", title: "Courier Studio — …", description: "…", about })
 * ```
 */
export function webPageNode(page: PageFacts): JsonLdNode {
  return {
    "@type": "WebPage",
    "@id": nodeId(page.path, "webpage"),
    url: absoluteUrl(page.path),
    name: page.title,
    description: page.description,
    inLanguage: "en",
    isPartOf: reference(websiteNode()),
    about: reference(page.about),
    primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl(ogImagePath(page.path)) },
    ...(page.updated ? { dateModified: page.updated } : {}),
  }
}
