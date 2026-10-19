/** A page by its address and title, with the navigation section it is in. */
export interface TitledPage {
  href: string
  title: string
  section?: string | undefined
}

/**
 * The title each page goes by in a tab and in search results: its own, or —
 * when another page has the same one — its own with its section after it,
 * so no two results of the site read alike.
 *
 * @param pages - Every page, with its title and section
 * @returns Each page's title, by its address
 * @example
 * ```ts
 * distinctTitles([
 *   { href: "/docs/api/create-caller", title: "createCaller", section: "API Reference" },
 *   { href: "/docs/server-side/caller", title: "createCaller", section: "Server-Side" },
 * ]).get("/docs/server-side/caller") // "createCaller (Server-Side)"
 * ```
 */
export function distinctTitles(pages: readonly TitledPage[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const { title } of pages) counts.set(title, (counts.get(title) ?? 0) + 1)
  return new Map(
    pages.map(({ href, title, section }) => {
      const shared = (counts.get(title) ?? 0) > 1
      return [href, shared && section ? `${title} (${section})` : title]
    })
  )
}
