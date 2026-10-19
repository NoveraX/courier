/** The heading levels of a record: the docs' section, the page, then its headings. */
export const LEVELS = ["lvl0", "lvl1", "lvl2", "lvl3", "lvl4", "lvl5", "lvl6"] as const

/** One of the heading levels. */
export type DocSearchLevel = (typeof LEVELS)[number]

/** What a record holds: a heading at one of the levels, or text under the deepest heading. */
export type DocSearchType = DocSearchLevel | "content"

/** A part of a record as the search answers it: the value, its matches marked. */
interface Snippet {
  value: string
}

/**
 * A record of the DocSearch index as a search answers it: the headings
 * above it, its text, where it is, and the snippets of each part with the
 * words that matched marked.
 */
export interface DocSearchRecord {
  objectID: string
  type: DocSearchType
  url: string
  content: string | null
  hierarchy: Record<DocSearchLevel, string | null>
  _snippetResult?: {
    content?: Snippet
    hierarchy?: Partial<Record<DocSearchLevel, Snippet>>
  }
}
