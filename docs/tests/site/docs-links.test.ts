/**
 * Every link in the docs to a docs page reaches one: a page the site has,
 * or an address it redirects to one, and, where the link names one, a
 * heading of that page. A link never names a section that moved: it names
 * where the section is now. A moved section is gone from the page it left,
 * and its new address is a page, and a heading, the site has; every
 * redirect of the site's leads to a page it has.
 */
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { docPages } from "@/site/content/docs-files"
import { MOVED_ANCHORS } from "@/site/content/moved-anchors"
import { pageHeadings } from "@/site/content/page-headings"
import { EXAMPLE_PAGES } from "@/site/sandbox/example-pages"

import nextConfig from "../../next.config"

/* The pages, found from this test wherever the run starts. */
const PAGES = fileURLToPath(new URL("../../src/content/docs", import.meta.url))
const FENCE = /^\s*(`{3,}|~{3,})/
const LINK = /\]\((\/docs[^)\s]*|#[^)\s]*)\)/g
/* An anchor a page sets itself, beside a heading's: `<a id="app-origin"></a>`. */
const ID = /\bid="([^"]+)"/g

const pages = docPages(PAGES)
/* Each page written in MDX, by its address, with its headings' anchors and the ones it sets. */
const anchors = new Map(
  pages.map((page) => [
    `/docs/${page.slug.join("/")}`,
    new Set([...pageHeadings(page.source).map((heading) => heading.id), ...idsOf(page.source)]),
  ])
)
/* The live examples' pages, written as code: they have no headings to link to. */
const examples = new Set(Object.keys(EXAMPLE_PAGES).map((name) => `/docs/examples/${name}`))
const redirects = new Map(
  ((await nextConfig.redirects?.()) ?? []).map((redirect) => [
    redirect.source,
    redirect.destination,
  ])
)

/* The lines of a page's prose, its code left out, each with its number. */
function proseLines(source: string): { text: string; line: number }[] {
  const lines: { text: string; line: number }[] = []
  let fenced = false
  for (const [index, text] of source.split("\n").entries()) {
    if (FENCE.test(text)) fenced = !fenced
    else if (!fenced) lines.push({ text, line: index + 1 })
  }
  return lines
}

function idsOf(source: string): string[] {
  return proseLines(source).flatMap(({ text }) =>
    [...text.matchAll(ID)].map((match) => match[1] ?? "")
  )
}

/* The links to docs pages in a page's prose, its code left out, each with the line it is on. */
function linksOf(source: string): { href: string; line: number }[] {
  return proseLines(source).flatMap(({ text, line }) =>
    [...text.matchAll(LINK)].map((match) => ({ href: match[1] ?? "", line }))
  )
}

/* What is wrong with a link on the page at `from`: nothing for one that reaches its page and heading. */
function problemOf(from: string, href: string): string | undefined {
  const [address = "", anchor = ""] = href.split("#")
  const named = address === "" ? from : address.replace(/\.md$/, "").replace(/\/$/, "")
  const page = redirects.get(named) ?? named
  if (examples.has(page)) return anchor === "" ? undefined : "an example's page has no headings"
  const headings = anchors.get(page)
  if (headings === undefined) return "the site has no such page"
  if (anchor === "") return undefined
  const moved = MOVED_ANCHORS[page]?.[anchor]
  if (moved !== undefined) return `the section moved: link to ${moved}`
  return headings.has(anchor) ? undefined : `${page} has no heading #${anchor}`
}

describe("the links in the docs", () => {
  it("each reach a page the site has, and the heading they name", () => {
    const broken = pages.flatMap((page) => {
      const from = `/docs/${page.slug.join("/")}`
      return linksOf(page.source).flatMap(({ href, line }) => {
        const problem = problemOf(from, href)
        return problem === undefined
          ? []
          : [`${page.slug.join("/")}.mdx:${line} ${href}: ${problem}`]
      })
    })

    expect(broken).toEqual([])
    expect(pages.reduce((count, page) => count + linksOf(page.source).length, 0)).toBeGreaterThan(
      500
    )
  })
})

describe("a section that moved", () => {
  it("is gone from the page it left, and its new address is a page and a heading the site has", () => {
    const wrong = Object.entries(MOVED_ANCHORS).flatMap(([from, moved]) =>
      Object.entries(moved).flatMap(([anchor, to]) => {
        if (!anchors.has(from)) return [`${from}: the site has no such page`]
        if (anchors.get(from)?.has(anchor)) return [`${from}#${anchor}: the page still has it`]
        const problem = problemOf(from, to)
        return problem === undefined ? [] : [`${from}#${anchor} → ${to}: ${problem}`]
      })
    )

    expect(wrong).toEqual([])
  })
})

describe("the site's redirects", () => {
  it("each lead from an address no page has to a page the site has", () => {
    const wrong = [...redirects].flatMap(([source, destination]) => {
      if (anchors.has(source)) return [`${source}: a page has this address`]
      const problem = problemOf(source, destination)
      return problem === undefined ? [] : [`${source} → ${destination}: ${problem}`]
    })

    expect(wrong).toEqual([])
    expect(redirects.size).toBeGreaterThan(0)
  })
})
