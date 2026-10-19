/**
 * A result's text arrives from the docs' index with the matched words
 * marked and with `<`, `>`, `&` and quotes kept as HTML entities. Search
 * cuts it into runs it draws as text — never as markup — reading each
 * entity once.
 */
import { describe, expect, it } from "vitest"

import {
  decodeEntities,
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  highlightParts,
  plainText,
} from "@/site/search/highlight-parts"

const marked = (word: string) => `${HIGHLIGHT_OPEN}${word}${HIGHLIGHT_CLOSE}`

describe("a result's highlighted text", () => {
  it("cuts the text into runs, the matched words marked", () => {
    expect(highlightParts(`the ${marked("proxy")} route ${marked("caller")}`)).toEqual([
      { text: "the ", matched: false },
      { text: "proxy", matched: true },
      { text: " route ", matched: false },
      { text: "caller", matched: true },
    ])
  })

  it("keeps text with no match as one run, and empty text as none", () => {
    expect(highlightParts("Overview")).toEqual([{ text: "Overview", matched: false }])
    expect(highlightParts("")).toEqual([])
  })

  it("runs a match left open to the end of the text", () => {
    expect(highlightParts(`create${HIGHLIGHT_OPEN}Proxy`)).toEqual([
      { text: "create", matched: false },
      { text: "Proxy", matched: true },
    ])
  })

  it("draws markup in a page's text as the characters the page showed", () => {
    const parts = highlightParts(
      `returns &lt;script&gt;alert(1)&lt;/script&gt; as ${marked("text")}`
    )

    expect(parts[0]).toEqual({ text: "returns <script>alert(1)</script> as ", matched: false })
    expect(parts[1]).toEqual({ text: "text", matched: true })
  })

  it("reads each entity once, so an escaped entity stays as the page showed it", () => {
    expect(decodeEntities("Promise&lt;T&gt; &amp;&amp; &quot;a&quot; &#039;b&#39;")).toBe(
      `Promise<T> && "a" 'b'`
    )
    expect(decodeEntities("write &amp;lt; for <")).toBe("write &lt; for <")
  })

  it("leaves an entity it does not know as it is", () => {
    expect(decodeEntities("a&nbsp;b &copy;")).toBe("a&nbsp;b &copy;")
  })

  it("gives the plain text without the marks", () => {
    expect(plainText(`${marked("Proxy")} mode &amp; more`)).toBe("Proxy mode & more")
  })
})
