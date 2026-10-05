/**
 * The reference shows sentences read straight from the docs pages, so the
 * code, links and strong text inside them must come through as such, not
 * as backticks and brackets.
 */
import { describe, expect, it } from "vitest"

import { inlineParts } from "@/site/content/inline-markdown"

describe("inline Markdown", () => {
  it("splits a sentence into its text and code", () => {
    expect(inlineParts("Created with `defineApi()`.")).toEqual([
      { kind: "text", text: "Created with " },
      { kind: "code", text: "defineApi()" },
      { kind: "text", text: "." },
    ])
  })

  it("reads a link's label and address, and strong text", () => {
    expect(inlineParts("See [Reserved names](/docs/a#b), **always**")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "Reserved names", href: "/docs/a#b" },
      { kind: "text", text: ", " },
      { kind: "strong", text: "always" },
    ])
  })

  it("keeps code inside a link's label for the label to draw", () => {
    expect(inlineParts("[`raw`](/docs/raw)")).toEqual([
      { kind: "link", text: "`raw`", href: "/docs/raw" },
    ])
  })

  it("leaves a line without Markdown as one run of text", () => {
    expect(inlineParts("Plain words.")).toEqual([{ kind: "text", text: "Plain words." }])
  })
})
