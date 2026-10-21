/**
 * A string written into a page's inline script: it reads back as itself,
 * and nothing in it can end the script, or a line for an older parser.
 */
import { describe, expect, it } from "vitest"

import { scriptLiteral } from "@/site/consent/script-literal"

const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

describe("a string written into an inline script", () => {
  it("leaves a plain key as JSON writes it", () => {
    expect(scriptLiteral("courier:analytics-consent")).toBe('"courier:analytics-consent"')
  })

  it("reads back as exactly the same string", () => {
    const values = [
      "courier:analytics-consent",
      'a"b',
      "back\\slash",
      `</script>${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}`,
    ]

    for (const value of values) expect(JSON.parse(scriptLiteral(value))).toBe(value)
  })

  it("holds no sign that could close the script it is in", () => {
    const literal = scriptLiteral("</script><!-- -->")

    expect(literal).not.toMatch(/[<>]/)
    expect(literal).toBe('"\\u003c/script\\u003e\\u003c!-- --\\u003e"')
  })

  it("holds neither line separator, which an older parser reads as the end of a line", () => {
    const literal = scriptLiteral(`a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`)

    expect(literal).not.toContain(LINE_SEPARATOR)
    expect(literal).not.toContain(PARAGRAPH_SEPARATOR)
    expect(literal).toBe('"a\\u2028b\\u2029c"')
  })
})
