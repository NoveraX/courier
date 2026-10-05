/**
 * The docs as llms.txt: what Courier is, where the whole documentation is
 * as one file, and every page by section with a link and what it covers.
 */
import { describe, expect, it } from "vitest"

import { docsNav } from "@/site/content/docs-nav"
import { llmsIndex } from "@/site/content/llms"

describe("llms.txt", () => {
  const text = llmsIndex("https://docs.test", (href) =>
    href === "/docs/quick-start" ? "First call" : ""
  )

  it("names Courier, then points at the whole documentation in one file", () => {
    const [title, , summary, , full] = text.split("\n")

    expect(title).toBe("# @noverax/courier")
    expect(summary?.startsWith("> ")).toBe(true)
    expect(full).toBe(
      "The whole documentation as one Markdown file: https://docs.test/llms-full.txt"
    )
  })

  it("lists every page under its section, linked, with what it covers when known", () => {
    expect(text).toContain(
      "## Getting Started\n\n- [Installation](https://docs.test/docs/installation)\n- [Quick Start](https://docs.test/docs/quick-start): First call"
    )
    expect(text.match(/^- \[/gm)).toHaveLength(docsNav.reduce((n, s) => n + s.items.length, 0))
  })
})
