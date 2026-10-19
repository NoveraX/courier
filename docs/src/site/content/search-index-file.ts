import type { SearchEntry } from "./search-index"

/** Where the search index is served: written once when the site is built, fetched as search needs it. */
export const SEARCH_INDEX_PATH = "/search-index.json"

const FIELDS = ["title", "href", "group", "description"] as const

function isSearchEntry(value: unknown): value is SearchEntry {
  if (typeof value !== "object" || value === null) return false
  if ("page" in value && typeof Reflect.get(value, "page") !== "string") return false
  return FIELDS.every((field) => field in value && typeof Reflect.get(value, field) === "string")
}

/**
 * The search index as the page reads it from the file the site serves:
 * every entry with its title, address, section and description — and the
 * page it is a part of, when it is one — or nothing when the file is not
 * that.
 *
 * @param value - What the file parsed to
 * @returns The entries, or `null` when the file holds anything else
 * @example
 * ```ts
 * searchIndexOf(await (await fetch(SEARCH_INDEX_PATH)).json())?.length // 120
 * ```
 */
export function searchIndexOf(value: unknown): SearchEntry[] | null {
  return Array.isArray(value) && value.every(isSearchEntry) ? value : null
}
