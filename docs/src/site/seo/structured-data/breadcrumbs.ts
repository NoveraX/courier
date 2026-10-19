import { absoluteUrl, type JsonLdNode, nodeId } from "./json-ld-node"

/** A step of the way to a page: its name, and the address it leads to. */
export interface Crumb {
  name: string
  path: string
}

/**
 * The way to a page from the site's root, as search results show it above
 * the page's title. A step that leads where the one before it does, or to
 * the page itself, is left out, so no two steps go to the same address.
 *
 * @param trail - The steps from the root, the page itself last
 * @returns The breadcrumb list
 * @example
 * ```ts
 * breadcrumbList([{ name: "Courier", path: "/" }, { name: "Quick Start", path: "/docs/quick-start" }])
 * ```
 */
export function breadcrumbList(trail: readonly Crumb[]): JsonLdNode {
  const page = trail.at(-1)
  if (!page) throw new Error("A breadcrumb list needs the page it leads to")
  const steps = trail
    .slice(0, -1)
    .filter((crumb, index, all) => crumb.path !== page.path && crumb.path !== all[index - 1]?.path)
  return {
    "@type": "BreadcrumbList",
    "@id": nodeId(page.path, "breadcrumb"),
    itemListElement: [...steps, page].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}
