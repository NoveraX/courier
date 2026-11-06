/* The types a request names Markdown by. */
const MARKDOWN = ["text/markdown", "text/x-markdown"]
const HTML = ["text/html"]
/* An Accept longer than this, or of more ranges, is read as asking for nothing in particular. */
const MOST_CHARS = 4096
const MOST_RANGES = 32
const TOKEN = /^[a-z0-9!#$%&'*+.^_`|~-]+$/
const QVALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/

/** A media range of an Accept header: its type, how much it counts, and where it stands. */
interface Range {
  readonly type: string
  readonly subtype: string
  readonly q: number
  readonly order: number
}

/** How much a type counts by the most specific range that covers it, and whether that range names it. */
interface Match {
  readonly q: number
  readonly order: number
  readonly named: boolean
}

/* The header's ranges, those it writes as no range left out; nothing when it is past its limits. */
function rangesOf(accept: string): Range[] | null {
  if (accept.length > MOST_CHARS) return null
  const parts = accept.split(",")
  if (parts.length > MOST_RANGES) return null
  return parts.flatMap((part, order) => {
    const [media = "", ...params] = part.split(";")
    const [type = "", subtype = "", rest] = media.trim().toLowerCase().split("/")
    if (rest !== undefined || !(TOKEN.test(type) || type === "*")) return []
    if (!(TOKEN.test(subtype) || subtype === "*") || (type === "*" && subtype !== "*")) return []
    const q = params
      .map((param) => param.trim().toLowerCase())
      .find((param) => param.startsWith("q="))
    const value = q?.slice(2).trim() ?? "1"
    return QVALUE.test(value) ? [{ type, subtype, q: Number(value), order }] : []
  })
}

/* The most specific of the ranges that cover one of the types: a range naming it, then its type's
   wildcard, then the wildcard of all — the highest q among those of one rank. */
function matchOf(ranges: readonly Range[], types: readonly string[]): Match | undefined {
  const ranks = [
    (range: Range) => types.includes(`${range.type}/${range.subtype}`),
    (range: Range) =>
      range.subtype === "*" && types.some((type) => type.startsWith(`${range.type}/`)),
    (range: Range) => range.type === "*",
  ]
  for (const [rank, covers] of ranks.entries()) {
    const covering = ranges.filter(covers)
    if (covering.length === 0) continue
    const best = covering.reduce((top, range) => (range.q > top.q ? range : top))
    return { q: best.q, order: best.order, named: rank === 0 }
  }
  return undefined
}

/**
 * Whether a request for a docs page asks for its Markdown rather than its
 * page, by its `Accept`, as nextjs.org reads the same headers. Each type
 * counts as much as the most specific range that covers it. Markdown is
 * chosen only when a range names it, its q is above 0, and it counts for
 * more than HTML does — or as much, when HTML is covered by a wildcard
 * alone, or named after it. A range whose q is not one is passed over; a
 * header past its limits asks for nothing in particular.
 *
 * @param accept - The request's `Accept`, if it sent one
 * @returns Whether to answer with the page's Markdown
 * @example
 * ```ts
 * prefersMarkdown("text/markdown;q=0.8, text/html;q=0.9") // false: HTML counts for more
 * prefersMarkdown("text/markdown, text/html") // true: named first, as much
 * ```
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (accept === null) return false
  const ranges = rangesOf(accept)
  if (ranges === null) return false
  const markdown = matchOf(ranges, MARKDOWN)
  if (markdown === undefined || !markdown.named || markdown.q <= 0) return false
  const html = matchOf(ranges, HTML)
  if (html === undefined || markdown.q !== html.q) return markdown.q > (html?.q ?? 0)
  return !html.named || markdown.order < html.order
}
