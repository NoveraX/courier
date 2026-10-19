import type { SearchEntry } from "@/site/content/search-index"
import { searchDocs } from "@/site/content/search-index"
import type { HighlightPart } from "./highlight-parts"
import type { SearchGroup } from "./search-types"

function runsOf(text: string, marked: readonly boolean[]): HighlightPart[] {
  const parts: HighlightPart[] = []
  let start = 0
  for (let at = 1; at <= text.length; at++) {
    if (at < text.length && marked[at] === marked[start]) continue
    parts.push({ text: text.slice(start, at), matched: marked[start] === true })
    start = at
  }
  return parts
}

const SPECIAL = /[.*+?^${}()|[\]\\]/g

/**
 * The typed words as patterns that find each of them, whatever its case —
 * compiled once for every title they mark.
 *
 * @param query - What was typed
 * @returns One pattern a word
 * @example
 * ```ts
 * wordPatterns("proxy c++") // [/proxy/gi, /c\+\+/gi]
 * ```
 */
export function wordPatterns(query: string): RegExp[] {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => new RegExp(word.replace(SPECIAL, "\\$&"), "gi"))
}

/**
 * A title with every place a typed word occurs in it marked, whatever its
 * case — at the title's own positions, which lowering a title's case can
 * shift.
 *
 * @param text - The title
 * @param patterns - The typed words, as `wordPatterns` makes them
 * @returns The title's runs, the matches marked
 * @example
 * ```ts
 * markWords("createProxyCaller", wordPatterns("proxy"))
 * // [{ text: "create", matched: false }, { text: "Proxy", matched: true }, { text: "Caller", matched: false }]
 * ```
 */
export function markWords(text: string, patterns: readonly RegExp[]): HighlightPart[] {
  const marked = new Array<boolean>(text.length).fill(false)
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      marked.fill(true, match.index, match.index + match[0].length)
    }
  }
  return runsOf(text, marked)
}

/**
 * The pages and exports the site lists itself, under their sections: every
 * one while nothing is typed, else those whose title, section or
 * description holds every typed word, the words marked in the titles, an
 * entry inside a page under that page's name — what search offers to
 * browse, and what it finds when the docs' index cannot be reached.
 *
 * @param entries - The pages and exports
 * @param query - What was typed
 * @returns The groups, in the order search ranks the entries
 * @example
 * ```ts
 * localGroups(entries, "proxy caller")[0]?.options[0]?.href // "/reference#create-proxy-caller"
 * ```
 */
export function localGroups(entries: readonly SearchEntry[], query: string): SearchGroup[] {
  const patterns = wordPatterns(query)
  const groups = new Map<string, SearchGroup>()
  for (const entry of searchDocs(entries, query)) {
    const group = groups.get(entry.group) ?? {
      id: `section:${entry.group}`,
      label: entry.group,
      options: [],
    }
    groups.set(entry.group, group)
    group.options.push({
      id: entry.href,
      href: entry.href,
      title: markWords(entry.title, patterns),
      trail: entry.page ? [entry.page] : [],
      kind: entry.href.includes("#") ? "heading" : "page",
    })
  }
  return [...groups.values()]
}
