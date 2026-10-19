import { languageOf, SITE_THEME_NAME, siteHighlighter, TOKENIZE_TIME_LIMIT } from "./highlighter"

/**
 * Code as highlighted HTML in the site's code colours: a `<pre>` of one
 * `<span class="line">` per line. A language the site does not load is
 * shown as plain text.
 *
 * @param code - The code
 * @param language - Its language, as a fence names it (`ts`, `bash`, …)
 * @returns The HTML
 * @example
 * ```ts
 * const html = await highlight('const a = "b"', "ts")
 * ```
 */
export async function highlight(code: string, language: string): Promise<string> {
  const engine = await siteHighlighter()
  return engine.codeToHtml(code, {
    lang: languageOf(language),
    theme: SITE_THEME_NAME,
    tokenizeTimeLimit: TOKENIZE_TIME_LIMIT,
  })
}
