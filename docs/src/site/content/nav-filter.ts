import type { NavSection } from "./docs-nav"

/**
 * The navigation narrowed to what a filter names: in each section, the
 * pages whose title holds it — every page of a section whose name holds
 * it — and no section left empty.
 *
 * @param sections - The navigation
 * @param filter - What to look for, any case
 * @returns The sections and pages that match
 * @example
 * ```ts
 * filterNav(docsNav, "next").map((s) => s.label) // ["Framework Guides"]
 * ```
 */
export function filterNav(sections: readonly NavSection[], filter: string): NavSection[] {
  const query = filter.trim().toLowerCase()
  if (!query) return [...sections]
  return sections.flatMap((section) => {
    const items = section.label.toLowerCase().includes(query)
      ? section.items
      : section.items.filter((item) => item.title.toLowerCase().includes(query))
    return items.length > 0 ? [{ ...section, items }] : []
  })
}
