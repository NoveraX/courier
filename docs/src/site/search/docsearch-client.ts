import type { LiteClient } from "algoliasearch/lite"

import { DOCSEARCH } from "./docsearch-config"
import type { DocSearchRecord } from "./docsearch-record"
import { groupHits } from "./search-hits"
import { docsearchRequest } from "./search-request"
import type { SearchGroup } from "./search-types"

let client: Promise<LiteClient> | undefined

async function loadClient(): Promise<LiteClient> {
  const { liteClient } = await import("algoliasearch/lite")
  return liteClient(DOCSEARCH.appId, DOCSEARCH.apiKey)
}

/* The client loads with the first search, apart from the page; one that
   failed to load is loaded again by the next. */
async function docsearchClient(): Promise<LiteClient> {
  client ??= loadClient()
  try {
    return await client
  } catch (error) {
    client = undefined
    throw error
  }
}

/**
 * Starts loading the search client before the first search needs it — as
 * the reader reaches for Search.
 *
 * @example
 * ```tsx
 * <button onPointerEnter={preloadDocsSearch} />
 * ```
 */
export function preloadDocsSearch(): void {
  docsearchClient().catch((error: unknown) => {
    console.warn("Search could not load its client; the next search tries again", error)
  })
}

/**
 * Searches the docs' index, which DocSearch fills from every page: the
 * results under the sections they are in, best first.
 *
 * @param query - What was typed
 * @returns The groups of results
 * @throws When the index cannot be reached, after the client has tried each of its hosts
 * @example
 * ```ts
 * const groups = await searchDocsIndex("retry middleware")
 * ```
 */
export async function searchDocsIndex(query: string): Promise<SearchGroup[]> {
  const search = await docsearchClient()
  const { results } = await search.search<DocSearchRecord>({
    requests: [docsearchRequest(query)],
  })
  const [result] = results
  return result && "hits" in result ? groupHits(result.hits) : []
}
