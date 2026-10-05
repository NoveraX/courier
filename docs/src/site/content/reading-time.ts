/* Words a reader gets through in a minute: prose, and code at half that pace. */
const PROSE_WPM = 220
const CODE_WEIGHT = 0.5

/**
 * How long a page takes to read, in whole minutes: its prose at an
 * ordinary pace, its code more slowly counted per word.
 *
 * @param markdown - The page as Markdown
 * @returns The minutes, at least one
 * @example
 * ```ts
 * readingMinutes(pageMarkdown(source, title, description)) // 4
 * ```
 */
export function readingMinutes(markdown: string): number {
  let prose = 0
  let code = 0
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced
      continue
    }
    const words = line.split(/\s+/).filter(Boolean).length
    if (fenced) code += words
    else prose += words
  }
  return Math.max(1, Math.round((prose + code * CODE_WEIGHT) / PROSE_WPM))
}
