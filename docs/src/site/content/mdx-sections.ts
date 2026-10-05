/** A fenced code block of a page: its language and its code. */
export interface CodeFence {
  language: string
  code: string
}

/** A part of a page under one heading, its code blocks and its prose. */
export interface MdxSection {
  heading: string
  /** The lines under the heading, up to the next heading of its level or above. */
  lines: string[]
}

const FENCE = /^```(\w*)/

/**
 * A page's parts under the headings of one level — `## ` or `### ` — read
 * outside its code fences, so a `#` inside code never starts a part.
 *
 * @param lines - The page's lines, or a part's
 * @param level - The heading level: 2 for `##`, 3 for `###`
 * @returns The parts, in page order
 * @example
 * ```ts
 * sectionsOf(source.split("\n"), 2).map((s) => s.heading) // ["Import", "Signature", …]
 * ```
 */
export function sectionsOf(lines: readonly string[], level: 2 | 3): MdxSection[] {
  const marker = `${"#".repeat(level)} `
  const sections: MdxSection[] = []
  let fenced = false
  for (const line of lines) {
    if (FENCE.test(line.trimStart())) fenced = !fenced
    const heading = !fenced && line.startsWith(marker)
    const higher = !fenced && level === 3 && line.startsWith("## ")
    if (heading) sections.push({ heading: line.slice(marker.length).trim(), lines: [] })
    else if (higher) sections.push({ heading: "", lines: [] })
    else sections.at(-1)?.lines.push(line)
  }
  return sections.filter((section) => section.heading !== "")
}

/**
 * The fenced code blocks among a part's lines, in order.
 *
 * @param lines - The lines
 * @returns Each block's language and code
 * @example
 * ```ts
 * fencesOf(["```ts", "const a = 1", "```"]) // [{ language: "ts", code: "const a = 1" }]
 * ```
 */
export function fencesOf(lines: readonly string[]): CodeFence[] {
  const fences: CodeFence[] = []
  let open: { language: string; body: string[] } | null = null
  for (const line of lines) {
    const match = FENCE.exec(line.trimStart())
    if (match && !open) open = { language: match[1] || "text", body: [] }
    else if (match && open) {
      fences.push({ language: open.language, code: open.body.join("\n") })
      open = null
    } else open?.body.push(line)
  }
  return fences
}

/**
 * A part's lines outside its code blocks — its prose and lists.
 *
 * @param lines - The lines
 * @returns The lines no code block holds, fences included
 * @example
 * ```ts
 * outsideFences(["- `a` — b", "```ts", "- `c` — d", "```"]) // ["- `a` — b"]
 * ```
 */
export function outsideFences(lines: readonly string[]): string[] {
  let fenced = false
  return lines.filter((line) => {
    if (FENCE.test(line.trimStart())) {
      fenced = !fenced
      return false
    }
    return !fenced
  })
}

/**
 * The first paragraph of prose among a part's lines: its lines joined, up
 * to a blank line, a code block or a list.
 *
 * @param lines - The lines
 * @returns The paragraph, or an empty string when there is none
 * @example
 * ```ts
 * firstParagraph(["", "An API source.", "", "```ts"]) // "An API source."
 * ```
 */
export function firstParagraph(lines: readonly string[]): string {
  const start = lines.findIndex((line) => line.trim() !== "")
  if (start < 0) return ""
  const paragraph: string[] = []
  for (const line of lines.slice(start)) {
    const text = line.trim()
    if (text === "" || text.startsWith("```") || text.startsWith("- ") || text.startsWith("<"))
      break
    paragraph.push(text)
  }
  return paragraph.join(" ")
}
