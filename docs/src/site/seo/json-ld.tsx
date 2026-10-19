import type { JsonLdNode } from "./structured-data/json-ld-node"

/**
 * A page's structured data as the text of its script: schema.org JSON-LD,
 * every `<` escaped so no text in it can close the script early.
 *
 * @param graph - The page's nodes
 * @returns The script's text
 * @example
 * ```ts
 * jsonLdText([organizationNode()]).startsWith('{"@context":"https://schema.org"') // true
 * ```
 */
export function jsonLdText(graph: readonly JsonLdNode[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll(
    "<",
    "\\u003c"
  )
}

/**
 * A page's structured data, for search engines to read what the page is,
 * who publishes it and the way to it.
 *
 * @param props - The page's nodes
 * @returns The script
 * @example
 * ```tsx
 * <JsonLd graph={docsGraph(page, coreVersion())} />
 * ```
 */
export function JsonLd({ graph }: { graph: readonly JsonLdNode[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(graph) }} />
  )
}
