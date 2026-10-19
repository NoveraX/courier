import type { SearchView } from "./search-view"

type MissingPages = NonNullable<SearchView["missingPages"]>

/** What search says in place of the site's pages while it has none to list. */
export const PAGES_NOTICE = {
  loading: "Loading…",
  failed: "Search could not load the pages. Close it and open it again.",
} as const satisfies Record<MissingPages, string>

/**
 * What search says where the site's own pages would be listed before they
 * have arrived: that they are on their way, or that they could not be
 * fetched — opening search again fetches them again.
 *
 * @param props - Why the pages are missing
 * @returns The notice
 * @example
 * ```tsx
 * <SearchPagesNotice missing="loading" />
 * ```
 */
export function SearchPagesNotice({ missing }: { missing: MissingPages }) {
  return (
    <p className="m-0 px-4 py-8 text-center text-control text-fg-muted">{PAGES_NOTICE[missing]}</p>
  )
}
