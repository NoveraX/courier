import { docSource } from "@/site/content/docs-files"
import { latestPageDate } from "@/site/content/page-dates"
import { sourceMetadata } from "@/site/content/source-metadata"

/**
 * When the API reference last changed: the newest date of the API pages
 * it is read from.
 *
 * @param pages - The addresses of the pages the reference reads
 * @returns The newest of their dates, `YYYY-MM-DD`, or `undefined` when none says
 * @example
 * ```ts
 * referenceUpdated(sections.map((section) => section.page)) // "2026-10-14"
 * ```
 */
export function referenceUpdated(pages: readonly string[]): string | undefined {
  return latestPageDate(
    pages.map((page) => {
      const source = docSource(page.replace(/^\/docs\//, "").split("/"))
      return source ? sourceMetadata(source).updated : undefined
    })
  )
}
