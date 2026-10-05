import { referenceSections } from "@/site/reference/reference-data"
import { referenceSearchEntries } from "@/site/reference/reference-search"
import { pageDescriptions } from "./page-descriptions"
import type { SearchEntry } from "./search-index"
import { searchEntries } from "./search-index"

/**
 * What search finds from any part of the site: the API reference's
 * exports, each leading to its section, then every docs page — so the
 * docs and the reference share one search.
 *
 * @returns The entries
 * @example
 * ```ts
 * (await siteSearchEntries()).some((entry) => entry.href.startsWith("/reference#")) // true
 * ```
 */
export async function siteSearchEntries(): Promise<SearchEntry[]> {
  const [described, sections] = await Promise.all([pageDescriptions(), referenceSections()])
  return [
    ...referenceSearchEntries(sections),
    ...searchEntries((href) => described.get(href) ?? ""),
  ]
}
