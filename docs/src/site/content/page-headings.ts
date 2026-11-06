/** A heading of a docs page as the site renders it: its level, its text and the id of its anchor. */
export interface PageHeading {
  /** 2 for `##`, 3 for `###`, and so on. */
  depth: number
  /** What the heading says, without its Markdown or the components in it. */
  text: string
  /** The id the site gives it, which `#` after the page's address points at. */
  id: string
}

const HEADING = /^(#{2,6})\s+(.*)$/
const FENCE = /^\s*```/
/* What the site removes from a heading's text to make its id: everything but letters, marks,
   decimal digits, the underscore, the hyphen and the space — as github-slugger does. */
const NOT_IN_ID = /[^\p{L}\p{M}\p{Nd}\p{Pc} -]/gu

/* A heading's text as the page shows it: code without its backticks, a link's words, emphasis
   unmarked, a component that holds no text gone, and an escaped character as itself. */
function headingText(source: string): string {
  return source
    .replace(/<([A-Za-z][\w.]*)\b[^>]*\/>/g, "")
    .replace(/<([A-Za-z][\w.]*)\b[^>]*>([^<]*)<\/\1>/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!<>])/g, "$1")
}

/**
 * The headings of a docs page as the site renders them, in order, each
 * with the id its anchor has there: its text lowercased, without the
 * characters an id leaves out, spaces as hyphens, and a second heading of
 * the same words numbered `-1`, the next `-2`. The page's own title is its
 * layout's, not its source's, so it is not among them.
 *
 * @param source - The page's MDX source
 * @returns The headings, outside its code blocks
 * @example
 * ```ts
 * pageHeadings("## The `courier()` factory\n\n## The `courier()` factory")
 * // [{ depth: 2, text: "The courier() factory", id: "the-courier-factory" }, { …, id: "the-courier-factory-1" }]
 * ```
 */
export function pageHeadings(source: string): PageHeading[] {
  const seen = new Map<string, number>()
  const headings: PageHeading[] = []
  let fenced = false
  for (const line of source.split("\n")) {
    if (FENCE.test(line)) fenced = !fenced
    const match = fenced ? null : HEADING.exec(line)
    if (!match?.[1] || match[2] === undefined) continue
    /* Markdown trims a heading's words at both ends before it reads them. */
    const text = headingText(match[2].trimEnd())
    const base = text.toLowerCase().replace(NOT_IN_ID, "").replace(/ /g, "-")
    let id = base
    while (seen.has(id)) {
      const count = (seen.get(base) ?? 0) + 1
      seen.set(base, count)
      id = `${base}-${count}`
    }
    seen.set(id, 0)
    headings.push({ depth: match[1].length, text: text.trim(), id })
  }
  return headings
}
