import { SITE_URL } from "@/site/site-url"
import type { DocSearchRecord } from "./docsearch-record"
import { LEVELS } from "./docsearch-record"
import type { HighlightPart } from "./highlight-parts"
import { decodeEntities, highlightParts } from "./highlight-parts"
import type { SearchGroup, SearchOption, SearchOptionKind } from "./search-types"

/* What a page outside the docs' sections is filed under. */
const NO_SECTION = "Documentation"

/* The page's main column. A page's own heading has no id, so the crawler
   takes this one for it; the page opens at its top without it. */
const PAGE_TOP = "#main-content"

interface Ranked {
  section: string
  page: string
  option: SearchOption
}

const WEB = new Set(["https:", "http:"])

/**
 * Where a record leads, as a link on the site: a path for a page of the
 * site — on whatever host it is served from — and the whole address for
 * a web page elsewhere. Any other address is no link at all.
 *
 * @param url - The record's address
 * @returns The link, or `null` when the address does not parse or is not a web page's
 * @example
 * ```ts
 * hrefOf("https://courier.noverax.cloud/docs/installation#requirements")
 * // "/docs/installation#requirements"
 * ```
 */
export function hrefOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url, SITE_URL)
  } catch (error) {
    console.warn("Search left out a result whose address does not parse", url, error)
    return null
  }
  if (!WEB.has(parsed.protocol)) return null
  if (parsed.origin !== SITE_URL) return parsed.href
  const hash = parsed.hash === PAGE_TOP ? "" : parsed.hash
  return `${parsed.pathname}${parsed.search}${hash}`
}

function kindOf(record: DocSearchRecord): SearchOptionKind {
  if (record.type === "content") return "text"
  return record.type === "lvl0" || record.type === "lvl1" ? "page" : "heading"
}

function titleOf(record: DocSearchRecord): HighlightPart[] {
  const snippets = record._snippetResult
  if (record.type === "content")
    return highlightParts(snippets?.content?.value ?? record.content ?? "")
  return highlightParts(
    snippets?.hierarchy?.[record.type]?.value ?? record.hierarchy[record.type] ?? ""
  )
}

function trailOf(record: DocSearchRecord): string[] {
  const depth = record.type === "content" ? LEVELS.length : LEVELS.indexOf(record.type)
  return LEVELS.slice(1, depth).flatMap((level) => {
    const heading = record.hierarchy[level]
    return heading ? [decodeEntities(heading)] : []
  })
}

function rankedOf(record: DocSearchRecord): Ranked[] {
  const href = hrefOf(record.url)
  if (href === null) return []
  const section = decodeEntities(record.hierarchy.lvl0 ?? NO_SECTION)
  const option = {
    id: record.objectID,
    href,
    title: titleOf(record),
    trail: trailOf(record),
    kind: kindOf(record),
  }
  return [{ section, page: href.split("#")[0] ?? href, option }]
}

function textOf(title: readonly HighlightPart[]): string {
  return title.map((part) => part.text).join("")
}

/* Of two titles for one place, the page's own heading rather than its
   document title, which carries the site's name after it. */
function shorterTitle(kept: HighlightPart[], other: HighlightPart[]): HighlightPart[] {
  const keptText = textOf(kept)
  const otherText = textOf(other)
  return otherText.length < keptText.length && keptText.startsWith(otherText) ? other : kept
}

function withoutRepeats(ranked: readonly Ranked[]): Ranked[] {
  const kept = new Map<string, Ranked>()
  for (const entry of ranked) {
    const first = kept.get(entry.option.href)
    if (!first) {
      kept.set(entry.option.href, entry)
      continue
    }
    const title = shorterTitle(first.option.title, entry.option.title)
    kept.set(entry.option.href, { ...first, option: { ...first.option, title } })
  }
  return [...kept.values()]
}

/**
 * What the search found, as its list shows it: under each section of the
 * docs, in the order the search ranked them, the results of one page kept
 * together. One place is offered once, however many records lead to it.
 *
 * @param records - The records the search answered, best first
 * @returns The groups
 * @example
 * ```ts
 * groupHits(results.hits)[0]?.label // "Proxy mode"
 * ```
 */
export function groupHits(records: readonly DocSearchRecord[]): SearchGroup[] {
  const sections = new Map<string, Map<string, SearchOption[]>>()
  for (const { section, page, option } of withoutRepeats(records.flatMap(rankedOf))) {
    const pages = sections.get(section) ?? new Map<string, SearchOption[]>()
    sections.set(section, pages)
    pages.set(page, [...(pages.get(page) ?? []), option])
  }
  return [...sections].map(([label, pages]) => ({
    id: `section:${label}`,
    label,
    options: [...pages.values()].flat(),
  }))
}
