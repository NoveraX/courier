import type { SearchForHitsOptions, SearchParamsObject } from "algoliasearch/lite"

import { DOCSEARCH } from "./docsearch-config"
import { LEVELS } from "./docsearch-record"
import { HIGHLIGHT_CLOSE, HIGHLIGHT_OPEN } from "./highlight-parts"

/* How many words of a heading or of text a result shows around a match. */
const SNIPPET_WORDS = 15

/* As many as the list has room for; DocSearch asks for as many. */
const HITS_PER_SEARCH = 20

/** A search of one index, its parameters given one by one. */
export type IndexSearch = SearchForHitsOptions & SearchParamsObject

/**
 * The search the docs' index is asked for what was typed: the headings and
 * text of each record, and snippets of them with the matches marked. The
 * whole highlighted text of a record is not asked for — a snippet is all a
 * result shows, and a record's text runs to thousands of characters.
 *
 * @param query - What was typed
 * @returns The request, for the search client
 * @example
 * ```ts
 * docsearchRequest("proxy caller").indexName // "Docs"
 * ```
 */
export function docsearchRequest(query: string): IndexSearch {
  return {
    indexName: DOCSEARCH.indexName,
    query,
    hitsPerPage: HITS_PER_SEARCH,
    attributesToRetrieve: [
      ...LEVELS.map((level) => `hierarchy.${level}`),
      "content",
      "type",
      "url",
    ],
    attributesToSnippet: [
      ...LEVELS.slice(1).map((level) => `hierarchy.${level}:${SNIPPET_WORDS}`),
      `content:${SNIPPET_WORDS}`,
    ],
    attributesToHighlight: [],
    snippetEllipsisText: "…",
    highlightPreTag: HIGHLIGHT_OPEN,
    highlightPostTag: HIGHLIGHT_CLOSE,
  }
}
