/* What would end the `<script>` the text is in, or a line where an older parser reads one. */
const UNSAFE_IN_SCRIPT = /[<>\u2028\u2029]/g

function unicodeEscape(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
}

/**
 * A string written as a JavaScript literal that stays whole inside a
 * page's inline `<script>`: quoted as JSON quotes it, with `<`, `>` and
 * the two line separators, which JSON leaves as they are, written as `\u`
 * escapes. It reads back as exactly the same string.
 *
 * @param value - The text
 * @returns The literal, as source text
 * @example
 * ```ts
 * scriptLiteral("courier:analytics-consent") // → '"courier:analytics-consent"'
 * scriptLiteral("</script>") // → '"\\u003c/script\\u003e"'
 * ```
 */
export function scriptLiteral(value: string): string {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, unicodeEscape)
}
