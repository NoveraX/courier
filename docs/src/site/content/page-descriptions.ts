import { loadDoc } from "./doc-module"
import { docSlugs } from "./docs-files"

/**
 * The description each docs page's metadata gives, by its address — what
 * search shows under a page and matches against.
 *
 * @returns The descriptions, keyed by address
 * @example
 * ```ts
 * (await pageDescriptions()).get("/docs/quick-start") // "Build a typed client in…"
 * ```
 */
export async function pageDescriptions(): Promise<ReadonlyMap<string, string>> {
  const pages = await Promise.all(
    docSlugs().map(async (slug) => {
      const { meta } = await loadDoc(slug)
      return [`/docs/${slug.join("/")}`, meta.description] as const
    })
  )
  return new Map(pages)
}
