/* The marks the search wraps a match in. No page's text holds them, so
   nothing a page says can read as one — and the text around them is never
   taken for markup. */
export const HIGHLIGHT_OPEN = "__courier-match__"
export const HIGHLIGHT_CLOSE = "__/courier-match__"

/** A run of a result's text, and whether it is a word that matched. */
export interface HighlightPart {
  text: string
  matched: boolean
}

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#039;", "'"],
  ["&#39;", "'"],
  ["&amp;", "&"],
])

const ENTITY = /&(?:lt|gt|quot|amp|#0?39);/g

/**
 * Text as the page showed it: the crawler keeps `<`, `>`, `&` and quotes
 * as HTML entities. Each is read once, so `&amp;lt;` stays the `&lt;` the
 * page showed.
 *
 * @param text - The text as the index keeps it
 * @returns The text as the page shows it
 * @example
 * ```ts
 * decodeEntities("Promise&lt;T&gt;") // "Promise<T>"
 * ```
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity) => ENTITIES.get(entity) ?? entity)
}

function pushPart(parts: HighlightPart[], raw: string, matched: boolean): void {
  if (raw) parts.push({ text: decodeEntities(raw), matched })
}

/**
 * A highlighted value cut into runs of text, the matches marked — for
 * drawing as text, never as markup. A match left open runs to the end.
 *
 * @param value - The value the search answered, with its marks
 * @returns The runs, in order
 * @example
 * ```ts
 * highlightParts(`the ${HIGHLIGHT_OPEN}proxy${HIGHLIGHT_CLOSE} route`)
 * // [{ text: "the ", matched: false }, { text: "proxy", matched: true }, { text: " route", matched: false }]
 * ```
 */
export function highlightParts(value: string): HighlightPart[] {
  const parts: HighlightPart[] = []
  let at = 0
  while (at < value.length) {
    const open = value.indexOf(HIGHLIGHT_OPEN, at)
    if (open === -1) {
      pushPart(parts, value.slice(at), false)
      break
    }
    pushPart(parts, value.slice(at, open), false)
    const start = open + HIGHLIGHT_OPEN.length
    const close = value.indexOf(HIGHLIGHT_CLOSE, start)
    pushPart(parts, value.slice(start, close === -1 ? value.length : close), true)
    at = close === -1 ? value.length : close + HIGHLIGHT_CLOSE.length
  }
  return parts
}

/**
 * A value's text without its marks, as the page showed it.
 *
 * @param value - The value, with or without marks
 * @returns The plain text
 * @example
 * ```ts
 * plainText(`${HIGHLIGHT_OPEN}Proxy${HIGHLIGHT_CLOSE} mode`) // "Proxy mode"
 * ```
 */
export function plainText(value: string): string {
  return highlightParts(value)
    .map((part) => part.text)
    .join("")
}
