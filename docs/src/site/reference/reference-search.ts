import type { SearchEntry } from "@/site/content/search-index"
import type { ReferenceSection } from "./reference-data"

/**
 * The reference's exports as search lists them, each leading to its own
 * section of the reference rather than to its docs page.
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
    group: "API reference",
    description: section.desc,
  }))
}
