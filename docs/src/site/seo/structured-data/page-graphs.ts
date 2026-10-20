import { findNavContext } from "@/site/content/docs-nav"
import { SITE_PAGES, type SitePage } from "@/site/seo/site-pages"
import { breadcrumbList, type Crumb } from "./breadcrumbs"
import type { JsonLdNode } from "./json-ld-node"
import { COURIER_PACKAGE } from "./packages"
import { techArticleNode, webPageNode } from "./page-nodes"
import { organizationNode, type PackageFacts, softwareNode, websiteNode } from "./site-nodes"

const HOME: Crumb = { name: "Courier", path: "/" }
const PRIVACY: Crumb = { name: SITE_PAGES.privacy.card.headline, path: SITE_PAGES.privacy.path }
const DOCS: Crumb = { name: "Docs", path: "/docs/introduction" }

/** A docs page, as its graph needs it. */
export interface DocsGraphPage {
  path: string
  title: string
  description: string
  updated?: string | undefined
}

/**
 * The home page's structured data: who publishes Courier, the site, Courier
 * itself as source code, and the page, which is about it.
 *
 * @param version - The core package's version
 * @returns The page's graph
 * @example
 * ```tsx
 * <JsonLd graph={homeGraph(coreVersion())} />
 * ```
 */
export function homeGraph(version: string): JsonLdNode[] {
  const courier = softwareNode({ ...COURIER_PACKAGE, version })
  return [
    organizationNode(),
    websiteNode(),
    courier,
    webPageNode({ ...SITE_PAGES.home, about: courier }),
  ]
}

/**
 * A docs or examples page's structured data: the page as an article about
 * Courier, with the way to it from the site's root — through the docs and
 * its section's first page.
 *
 * @param page - The page
 * @param version - The core package's version
 * @returns The page's graph
 * @example
 * ```tsx
 * <JsonLd graph={docsGraph({ path, title: meta.title, description: meta.description, updated: meta.updated }, coreVersion())} />
 * ```
 */
export function docsGraph(page: DocsGraphPage, version: string): JsonLdNode[] {
  const section = findNavContext(page.path)?.section
  const first = section?.items.find((item) => !item.disabled)
  const sectionCrumb = section && first ? [{ name: section.label, path: first.href }] : []
  const courier = softwareNode({ ...COURIER_PACKAGE, version })
  return [
    organizationNode(),
    websiteNode(),
    courier,
    techArticleNode({ ...page, about: courier, section: section?.label }),
    breadcrumbList([HOME, DOCS, ...sectionCrumb, { name: page.title, path: page.path }]),
  ]
}

/**
 * A landing page's structured data: the page, about the package it shows —
 * Studio, or the MCP server — beside Courier itself.
 *
 * @param page - The page
 * @param subject - The package it is about
 * @param version - The core package's version
 * @returns The page's graph
 * @example
 * ```tsx
 * <JsonLd graph={landingGraph(SITE_PAGES.studio, STUDIO_PACKAGE, coreVersion())} />
 * ```
 */
export function landingGraph(page: SitePage, subject: PackageFacts, version: string): JsonLdNode[] {
  const about = softwareNode(subject)
  return [
    organizationNode(),
    websiteNode(),
    softwareNode({ ...COURIER_PACKAGE, version }),
    about,
    webPageNode({ ...page, about }),
    breadcrumbList([HOME, { name: subject.name, path: page.path }]),
  ]
}

/**
 * The API reference's structured data: an article about Courier, as new as
 * the newest API page it is read from.
 *
 * @param updated - When the newest of those pages changed, `YYYY-MM-DD`
 * @param version - The core package's version
 * @returns The page's graph
 * @example
 * ```tsx
 * <JsonLd graph={referenceGraph("2026-10-14", coreVersion())} />
 * ```
 */
export function referenceGraph(updated: string | undefined, version: string): JsonLdNode[] {
  const { path, description } = SITE_PAGES.reference
  const courier = softwareNode({ ...COURIER_PACKAGE, version })
  const title = "API reference"
  return [
    organizationNode(),
    websiteNode(),
    courier,
    techArticleNode({ path, title, description, about: courier, updated }),
    breadcrumbList([HOME, { name: title, path }]),
  ]
}

/**
 * A legal page's structured data — the privacy notice, the consent to
 * analytics: the page, about the site, with the way to it from the root;
 * the consent through the notice it belongs to.
 *
 * @param page - The page
 * @param updated - When its text last changed, `YYYY-MM-DD`
 * @returns The page's graph
 * @example
 * ```tsx
 * <JsonLd graph={legalGraph(SITE_PAGES.privacy, legalUpdated("privacy"))} />
 * ```
 */
export function legalGraph(page: SitePage, updated: string | undefined): JsonLdNode[] {
  const site = websiteNode()
  const trail = page.path === PRIVACY.path ? [] : [PRIVACY]
  return [
    organizationNode(),
    site,
    webPageNode({ ...page, about: site, updated }),
    breadcrumbList([HOME, ...trail, { name: page.card.headline, path: page.path }]),
  ]
}
