import { languageOf, SITE_THEME, siteHighlighter, TOKENIZE_TIME_LIMIT } from "./highlighter"

/** The site's code colours, by what they paint. */
export type CodeTone =
  | "keyword"
  | "function"
  | "string"
  | "type"
  | "number"
  | "comment"
  | "punctuation"
  | "plain"

/** A run of code in one colour. */
export interface CodeToken {
  text: string
  tone: CodeTone
}

const TONES: ReadonlyMap<string, CodeTone> = new Map([
  ["keyword", "keyword"],
  ["function", "function"],
  ["string", "string"],
  ["type", "type"],
  ["number", "number"],
  ["comment", "comment"],
  ["punctuation", "punctuation"],
])

const TONE_OF_COLOR = /--color-code-(\w+)/

function toneOf(color: string | undefined): CodeTone {
  const name = TONE_OF_COLOR.exec(color ?? "")?.[1]
  return (name && TONES.get(name)) || "plain"
}

/**
 * Code highlighted as runs of text, one array per line — for code drawn a
 * character at a time, where highlighted HTML cannot be cut.
 *
 * @param code - The code
 * @param language - Its language, as a fence names it (`ts`, `bash`, …)
 * @returns Each line's runs, with the colour each is painted in
 * @example
 * ```ts
 * const [line] = await highlightTokens('const a = "b"', "ts")
 * line[0] // { text: "const", tone: "keyword" }
 * ```
 */
export async function highlightTokens(code: string, language: string): Promise<CodeToken[][]> {
  const engine = await siteHighlighter()
  const lines = engine.codeToTokensBase(code, {
    lang: languageOf(language),
    theme: SITE_THEME,
    tokenizeTimeLimit: TOKENIZE_TIME_LIMIT,
  })
  return lines.map((line) =>
    line.map(({ content, color }) => ({ text: content, tone: toneOf(color) }))
  )
}

/**
 * The first characters of a highlighted line, its runs cut where the count
 * ends — a line as it looks while being typed.
 *
 * @param line - The line's runs
 * @param count - How many characters to keep
 * @returns The runs holding those characters
 * @example
 * ```ts
 * sliceTokens([{ text: "const", tone: "keyword" }, { text: " a", tone: "plain" }], 6)
 * // [{ text: "const", tone: "keyword" }, { text: " ", tone: "plain" }]
 * ```
 */
export function sliceTokens(line: readonly CodeToken[], count: number): CodeToken[] {
  const kept: CodeToken[] = []
  let left = count
  for (const token of line) {
    if (left <= 0) break
    kept.push(left >= token.text.length ? token : { ...token, text: token.text.slice(0, left) })
    left -= token.text.length
  }
  return kept
}
