import type { SearchEntry } from "@/site/content/search-index"
import { localGroups } from "./local-results"
import type { RecentSearch } from "./recent-searches"
import type { SearchGroup } from "./search-types"

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
  /** The pages and exports the site lists itself. */
  entries: readonly SearchEntry[]
  recent: readonly RecentSearch[]
}

/**
 * What search shows for what was typed. With nothing typed: the results
 * opened lately, then every page and export to browse. While the index
 * answers for the first time, the pages whose titles match; then its
 * latest answer, kept until the next arrives. When the index cannot be
 * reached, the pages whose titles match, said to be just that.
 *
 * @param input - What was typed, the index's answer, the site's pages and the recent results
 * @returns The groups to list and how they were found
 * @example
 * ```ts
 * searchView({ query: "", answer, entries, recent }).groups[0]?.label // "Recent"
 * ```
 */
export function searchView({ query, answer, entries, recent }: SearchViewInput): SearchView {
  const typed = query.trim()
  if (!typed) {
    return {
      groups: [...recentGroup(recent), ...localGroups(entries, "")],
      titlesOnly: false,
      searching: false,
    }
  }
  if (answer.status === "failed") {
    return { groups: localGroups(entries, typed), titlesOnly: true, searching: false }
  }
  if (answer.groups === null) {
    return { groups: localGroups(entries, typed), titlesOnly: false, searching: true }
  }
  return { groups: answer.groups, titlesOnly: false, searching: answer.status === "searching" }
}
