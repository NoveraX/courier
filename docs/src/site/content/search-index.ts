import { docsNav } from "./docs-nav"

/** A page as search finds it. */
export interface SearchEntry {
  title: string
  href: string
  /** The navigation section it is in. */
  group: string
  description: string
  /** The page it is a part of, when it leads into one: the API reference, for an export. */
  page?: string
}

/**
 * Every page in the navigation, as search lists it: its title, address and
 * section, and the description its metadata gives, when there is one.
 *
 * @param describe - The description of the page at an address
 * @returns The entries, in the navigation's order
 * @example
 * ```ts
 * searchEntries((href) => descriptions.get(href) ?? "")
 * ```
 */
export function searchEntries(describe: (href: string) => string): SearchEntry[] {
  return docsNav.flatMap((section) =>
    section.items.map((item) => ({
      title: item.title,
      href: item.href,
      group: section.label,
      description: item.description ?? describe(item.href),
    }))
  )
}

/**
 * The entries a search finds: each word of it in the title, section or
 * description — first the pages whose title holds what was typed as one
 * run (`proxy caller` in `createProxyCaller`), then those with every word
 * in the title, then the rest.
 *
 * @param entries - The pages
 * @param query - What was typed
 * @returns The matches, best first; every page while nothing is typed
 * @example
 * ```ts
 * searchDocs(entries, "proxy caller")[0]?.title // "createProxyCaller"
 * ```
 */
export function searchDocs(entries: readonly SearchEntry[], query: string): SearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...entries]
  const run = words.join("")
  const rank = (entry: SearchEntry): number => {
    const title = entry.title.toLowerCase()
    if (title.replace(/\s+/g, "").includes(run)) return 0
    return words.every((word) => title.includes(word)) ? 1 : 2
  }
  return entries
    .filter((entry) => {
      const text = `${entry.title} ${entry.group} ${entry.description}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .map((entry, order) => ({ entry, order, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ entry }) => entry)
}
