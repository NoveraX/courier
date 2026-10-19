import { distinctTitles } from "./distinct-titles"
import { docSlugs, docSource } from "./docs-files"
import { findNavContext } from "./docs-nav"
import { sourceMetadata } from "./source-metadata"

/**
 * The title every docs page goes by in a tab and in search results, by
 * its address: its own, with its section after it when another docs page
 * shares it. Read from the pages' sources, so it is known where the site
 * is built.
 *
 * @returns The titles, by address
 * @example
 * ```ts
 * docTitles().get("/docs/react-query/realtime") // "Streams & Channels (React Query)"
 * ```
 */
export function docTitles(): ReadonlyMap<string, string> {
  return distinctTitles(
    docSlugs().map((slug) => {
      const href = `/docs/${slug.join("/")}`
      return {
        href,
        title: sourceMetadata(docSource(slug) ?? "").title ?? "",
        section: findNavContext(href)?.section.label,
      }
    })
  )
}
