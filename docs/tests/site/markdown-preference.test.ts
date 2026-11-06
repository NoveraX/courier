/**
 * Whether a request for a docs page asks for its Markdown rather than its
 * page, by its `Accept`: as nextjs.org answers the same headers, read by
 * the most specific range that names each type. Markdown is chosen only
 * when it is named outright and counts for more than HTML — or as much,
 * named first, or against HTML only a wildcard covers.
 */
import { describe, expect, it } from "vitest"

import { prefersMarkdown } from "@/site/content/markdown-preference"

describe("a request's Accept", () => {
  it.each([
    ["text/markdown", true],
    ["TEXT/MARKDOWN", true],
    ["text/markdown; charset=utf-8", true],
    ["text/x-markdown", true],
    ["text/markdown, text/html", true],
    ["text/html, text/markdown", false],
    ["text/html;q=0.5, text/markdown", true],
    ["text/markdown;q=0.5, text/html", false],
    ["text/markdown;q=0.8, */*;q=0.9", false],
    ["text/markdown;q=0.8, text/plain", true],
    ["application/json, text/markdown;q=0.1", true],
    ["text/markdown, */*", true],
    ["*/*", false],
    ["text/*", false],
    ["text/html", false],
    ["text/markdown;q=0", false],
    ["text/markdown;q=0, */*", false],
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
    ["", false],
    [null, false],
  ])("%j asks for Markdown: %s", (accept, markdown) => {
    expect(prefersMarkdown(accept)).toBe(markdown)
  })

  it("passes over a range whose q is not one, and reads one that is", () => {
    expect(prefersMarkdown("text/markdown;q=2")).toBe(false)
    expect(prefersMarkdown("text/markdown;q=abc, text/html")).toBe(false)
    expect(prefersMarkdown("text/markdown;q=1.000")).toBe(true)
    expect(prefersMarkdown("text/markdown;q=0.001, text/html;q=0")).toBe(true)
  })

  it("is read as no preference past its limits: longer than it may be, or too many ranges", () => {
    expect(prefersMarkdown(`text/markdown, ${"text/plain;q=0.1, ".repeat(40)}`)).toBe(false)
    expect(prefersMarkdown(`text/markdown;${" ".repeat(5000)}`)).toBe(false)
  })

  it("asks for Markdown the more, the more Markdown counts against HTML", () => {
    const qs = ["0", "0.1", "0.5", "0.9", "1"]
    for (const html of qs) {
      let asked = false
      for (const markdown of qs) {
        const now = prefersMarkdown(`text/html;q=${html}, text/markdown;q=${markdown}`)
        expect(now || !asked, `html ${html}, markdown ${markdown}`).toBe(true)
        asked = now
      }
    }
  })
})
