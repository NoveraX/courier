/* What ends a description cut short: an ellipsis, as the description writes it. */
const CUT_MARK = "\\u2026"

const HEX = /^[0-9a-fA-F]{4}$/

/* A character as a description writes it: printable ASCII as itself, a backslash doubled, any
   other character as the `\u` escape of each of its UTF-16 units. */
function written(char: string): string {
  if (char === "\\") return "\\\\"
  const code = char.charCodeAt(0)
  if (char.length === 1 && code >= 0x20 && code <= 0x7e) return char
  let escaped = ""
  for (let unit = 0; unit < char.length; unit += 1) {
    escaped += `\\u${char.charCodeAt(unit).toString(16).padStart(4, "0")}`
  }
  return escaped
}

/**
 * Text as a `Server-Timing` description carries it: printable ASCII, a
 * backslash doubled and every other character written as `\u` escapes, so
 * any text — a log line's arrow, a name in Cyrillic, a line break — rides
 * in a header. Past `most` characters it is cut where a character ends,
 * with an ellipsis.
 *
 * @param text - The text
 * @param most - The longest the description may be, the ellipsis included
 * @returns The description
 * @example
 * ```ts
 * escapeTimingText("users:getAll → 200") // "users:getAll \\u2192 200"
 * ```
 */
export function escapeTimingText(text: string, most = Number.POSITIVE_INFINITY): string {
  let out = ""
  let fitting = 0
  for (const char of text) {
    const part = written(char)
    if (out.length + part.length <= most - CUT_MARK.length) fitting = out.length + part.length
    out += part
    if (out.length > most) return out.slice(0, fitting) + CUT_MARK
  }
  return out
}

/**
 * The text a description written by {@link escapeTimingText} carries, or
 * `undefined` for one holding an escape that function never writes.
 *
 * @param description - The description, as the header carried it
 * @returns The text, or `undefined`
 * @example
 * ```ts
 * unescapeTimingText("users:getAll \\u2192 200") // "users:getAll → 200"
 * ```
 */
export function unescapeTimingText(description: string): string | undefined {
  let text = ""
  for (let at = 0; at < description.length; at += 1) {
    const char = description.charAt(at)
    if (char !== "\\") {
      text += char
      continue
    }
    const next = description.charAt(at + 1)
    const hex = description.slice(at + 2, at + 6)
    if (next === "\\") {
      text += "\\"
      at += 1
    } else if (next === "u" && HEX.test(hex)) {
      text += String.fromCharCode(Number.parseInt(hex, 16))
      at += 5
    } else {
      return undefined
    }
  }
  return text
}
