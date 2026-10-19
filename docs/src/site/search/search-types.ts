import type { HighlightPart } from "./highlight-parts"

/** What a result leads to: a whole page, a heading on one, or text under a heading. */
export type SearchOptionKind = "page" | "heading" | "text"

/** One result search offers, as its list shows it. */
export interface SearchOption {
  /** Unique among the results shown at once. */
  id: string
  /** Where it leads: a path on the site, with its anchor. */
  href: string
  /** What it is called, the words that matched marked. */
  title: HighlightPart[]
  /** Where it is, from its page down to the heading above it. */
  trail: readonly string[]
  kind: SearchOptionKind
}

/** Results under one heading of the list: a section of the docs, or Recent. */
export interface SearchGroup {
  id: string
  label: string
  options: SearchOption[]
}
