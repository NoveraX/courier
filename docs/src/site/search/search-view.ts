import { localGroups } from "./local-results"
import type { RecentSearch } from "./recent-searches"
import type { SearchGroup } from "./search-types"
import type { SearchIndexState } from "./use-search-index"

/** Where search stands with what was typed. */
export type SearchStatus = "idle" | "searching" | "done" | "failed"

/** What the docs' index answered, as search keeps it. */
export interface IndexAnswer {
  status: SearchStatus
  /** The groups of the latest answer, or `null` until the index has answered once. */
  groups: SearchGroup[] | null
}

/** What the list shows, and what is said about it. */
export interface SearchView {
  groups: SearchGroup[]
  /** The index could not be reached, so the results match page titles alone. */
  titlesOnly: boolean
  /** An answer to what was typed is on its way. */
  searching: boolean
  /**
   * Why the site's own pages are missing from a list made of them: still
   * on their way, or not fetched. `null` when they are there, or when the
   * list does not need them.
   */
  missingPages: "loading" | "failed" | null
}

/** The group of results opened from search before. */
export const RECENT_GROUP = "recent"

function recentGroup(recent: readonly RecentSearch[]): SearchGroup[] {
  if (recent.length === 0) return []
  const options = recent.map(({ href, title, trail, kind }) => ({
    id: `${RECENT_GROUP}:${href}`,
    href,
    title: [{ text: title, matched: false }],
    trail,
    kind,
  }))
  return [{ id: RECENT_GROUP, label: "Recent", options }]
}

interface SearchViewInput {
  query: string
  answer: IndexAnswer
  /** The pages and exports the site lists itself, as far as they have been fetched. */
  pages: SearchIndexState
  recent: readonly RecentSearch[]
}

function missing({ entries, failed }: SearchIndexState): SearchView["missingPages"] {
  if (entries) return null
  return failed ? "failed" : "loading"
}

/**
 * What search shows for what was typed. With nothing typed: the results
 * opened lately, then every page and export to browse. While the index
 * answers for the first time, the pages whose titles match; then its
 * latest answer, kept until the next arrives. When the index cannot be
 * reached, the pages whose titles match, said to be just that. A list
 * made of the site's pages before they have arrived says why they are
 * not there.
 *
 * @param input - What was typed, the index's answer, the site's pages and the recent results
 * @returns The groups to list and how they were found
 * @example
 * ```ts
 * searchView({ query: "", answer, pages, recent }).groups[0]?.label // "Recent"
 * ```
 */
export function searchView({ query, answer, pages, recent }: SearchViewInput): SearchView {
  const typed = query.trim()
  const listed = (words: string) => (pages.entries ? localGroups(pages.entries, words) : [])
  const lacking = missing(pages)
  if (!typed) {
    const groups = [...recentGroup(recent), ...listed("")]
    return { groups, titlesOnly: false, searching: false, missingPages: lacking }
  }
  if (answer.status === "failed") {
    return { groups: listed(typed), titlesOnly: true, searching: false, missingPages: lacking }
  }
  if (answer.groups === null) {
    return { groups: listed(typed), titlesOnly: false, searching: true, missingPages: null }
  }
  const searching = answer.status === "searching"
  return { groups: answer.groups, titlesOnly: false, searching, missingPages: null }
}
