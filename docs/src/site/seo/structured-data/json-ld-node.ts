import { SITE_URL } from "@/site/site-url"

/** A node of a page's structured data: a schema.org thing, named by its `@id` when others point to it. */
export interface JsonLdNode {
  "@type": string
  "@id"?: string
  [property: string]: unknown
}

/** A pointer from one node to another of the same page's graph. */
export interface JsonLdReference {
  "@id": string
}

/**
 * The `@id` of a node the site describes: an address of the site with a
 * fragment naming what is there.
 *
 * @param path - The page's address
 * @param thing - What the node is, as the fragment
 * @returns The id
 * @example
 * ```ts
 * nodeId("/", "organization") // "https://courier.noverax.cloud/#organization"
 * ```
 */
export function nodeId(path: string, thing: string): string {
  return `${absoluteUrl(path)}#${thing}`
}

/**
 * A page's address as structured data writes it: whole, with the site's
 * origin.
 *
 * @param path - The address, from the site's root
 * @returns The absolute URL
 * @example
 * ```ts
 * absoluteUrl("/docs/quick-start") // "https://courier.noverax.cloud/docs/quick-start"
 * ```
 */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

/**
 * A pointer to a node of the same graph.
 *
 * @param node - The node pointed to
 * @returns The pointer
 * @example
 * ```ts
 * reference(organizationNode()) // { "@id": "https://courier.noverax.cloud/#organization" }
 * ```
 */
export function reference(node: JsonLdNode): JsonLdReference {
  if (!node["@id"]) throw new Error(`A ${node["@type"]} node without an @id cannot be pointed to`)
  return { "@id": node["@id"] }
}
