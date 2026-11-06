/**
 * A page's headings and their anchors, read from its source, are the ones
 * the site renders: every page compiled as the site compiles it — with
 * remark-gfm and rehype-slug — gives each heading the id `pageHeadings`
 * gives it, and the ids follow github-slugger's on words a heading could
 * hold.
 */
import { compile } from "@mdx-js/mdx"
import GithubSlugger from "github-slugger"
import type { Element, Root } from "hast"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import { describe, expect, it } from "vitest"

import { docPages } from "@/site/content/docs-files"
import { pageHeadings } from "@/site/content/page-headings"

const HEADING_TAGS = new Set(["h2", "h3", "h4", "h5", "h6"])
/* Compiling every page as the site does is seconds of work, and more on a busy machine: no
   measure of speed, so it is given the time that work takes rather than the default's five
   seconds. */
const EVERY_PAGE_MS = 60_000

/* The ids rehype-slug gives a page's headings, in order. */
async function renderedIds(source: string): Promise<string[]> {
  const ids: string[] = []
  const collect = () => (tree: Root) => {
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue
        if (HEADING_TAGS.has(child.tagName)) ids.push(String(child.properties.id ?? ""))
        visit(child)
      }
    }
    visit(tree)
  }
  await compile(source, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, collect] })
  return ids
}

describe("a page's headings", () => {
  it("have the ids the site renders them with, on every page", {
    timeout: EVERY_PAGE_MS,
  }, async () => {
    const pages = docPages()
    for (const page of pages) {
      const read = pageHeadings(page.source).map((heading) => heading.id)
      expect(read, page.slug.join("/")).toEqual(await renderedIds(page.source))
    }
    expect(pages.length).toBeGreaterThan(100)
  })

  it("are numbered when two say the same, and leave out what an id has no room for", () => {
    const words = [
      "Proxy mode — the default",
      "What’s new in 0.4",
      "Quotes \"like these\" and 'these'",
      "Rate limits & budgets",
      "Ünïcode héadings",
      "Emoji 🚀 heading",
      "Ελληνική επικεφαλίδα",
      "under_score and hyphen-ated",
      "  spaced  out  ",
      "x² and ½",
    ]
    const slugger = new GithubSlugger()
    const twice = [...words, ...words]
    const source = twice.map((text) => `## ${text}`).join("\n\n")

    expect(pageHeadings(source).map((heading) => heading.id)).toEqual(
      twice.map((text) => slugger.slug(text.trim()))
    )
  })

  it("read their words without their Markdown or components", () => {
    expect(
      pageHeadings(
        '## The `courier()` factory <ModeBadge mode="proxy" />\n\n### See [the guide](/docs/x) *now*'
      ).map(({ depth, text }) => [depth, text])
    ).toEqual([
      [2, "The courier() factory"],
      [3, "See the guide now"],
    ])
  })
})
