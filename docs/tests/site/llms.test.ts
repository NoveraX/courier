/**
 * The docs as llms.txt: what Courier is, where the whole documentation is
 * as one file, and every page by section with a link — to its Markdown,
 * for a page written as text — and what it covers.
 */
import { describe, expect, it } from "vitest"

import { docsNav } from "@/site/content/docs-nav"
import { LLMS_HEADERS, llmsIndex } from "@/site/content/llms"

describe("the llms files' headers", () => {
  it("say plain text, kept out of search results and checked with the site on every request", () => {
    expect(LLMS_HEADERS).toEqual({
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=0, must-revalidate",
    })
  })
})

describe("llms.txt", () => {
  const text = llmsIndex(
    "https://docs.test",
    (href) => (href === "/docs/quick-start" ? "First call" : ""),
    (href) => !href.startsWith("/docs/examples/")
  )

  it("names Courier, then points at the whole documentation in one file", () => {
    const [title, , summary, , full] = text.split("\n")

    expect(title).toBe("# @noverax/courier")
    expect(summary?.startsWith("> ")).toBe(true)
    expect(full).toBe(
      "The whole documentation as one Markdown file: https://docs.test/llms-full.txt"
    )
  })

  it("says every docs page is served as Markdown too", () => {
    expect(text.split("\n")[6]).toBe(
      "Every docs page is served as Markdown too, at its address with .md after it, as the links below are."
    )
  })

  it("lists every page under its section, linked as Markdown, with what it covers when known", () => {
    expect(text).toContain(
      "## Getting Started\n\n- [Installation](https://docs.test/docs/installation.md)\n- [Quick Start](https://docs.test/docs/quick-start.md): First call"
    )
    expect(text).toContain(
      "- [Basic](https://docs.test/docs/examples/basic): Simple GET/POST requests"
    )
    expect(text.match(/^- \[/gm)).toHaveLength(docsNav.reduce((n, s) => n + s.items.length, 0))
  })
})
