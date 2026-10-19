import { API_SECTION } from "@/site/content/nav-reference"
import type { SearchEntry } from "@/site/content/search-index"
import type { ReferenceSection } from "./reference-data"
import { REFERENCE_TITLE } from "./reference-title"

/**
 * The reference's exports as search lists them, each leading to its own
 * section of the reference rather than to its docs page — under the API
 * Reference section, beside the functions' own pages, each marked as being
 * on the reference.
 *
 * @param sections - The reference's exports
 * @returns One entry an export, in the reference's order
 * @example
 * ```ts
 * referenceSearchEntries(sections)[0]?.href // "/reference#define"
 * ```
 */
export function referenceSearchEntries(
  sections: readonly Pick<ReferenceSection, "id" | "name" | "desc">[]
): SearchEntry[] {
  return sections.map((section) => ({
    title: section.name,
    href: `/reference#${section.id}`,
    group: API_SECTION,
    description: section.desc,
    page: REFERENCE_TITLE,
  }))
}
