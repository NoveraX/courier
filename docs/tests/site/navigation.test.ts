/**
 * Finding one's way around the docs: the sidebar's filter, the Previous and
 * Next links at a page's foot, search over every page, and how long a page
 * takes to read.
 */
import { describe, expect, it } from "vitest"

import { docsNav } from "@/site/content/docs-nav"
import { filterNav } from "@/site/content/nav-filter"
import { neighbors } from "@/site/content/neighbors"
import { readingMinutes } from "@/site/content/reading-time"
import { searchDocs, searchEntries } from "@/site/content/search-index"

describe("the sidebar's filter", () => {
  it("keeps the pages whose title holds it, every page of a section it names, and no empty section", () => {
    const pages = filterNav(docsNav, "NEXT")
    const section = filterNav(docsNav, "react query")

    expect(pages.map((s) => [s.label, s.items.map((i) => i.title)])).toEqual([
      ["Framework Guides", ["Next.js"]],
    ])
    expect(section[0]?.items.length).toBe(docsNav.find((s) => s.label === "React Query")?.items.length)
    expect(filterNav(docsNav, "  ")).toHaveLength(docsNav.length)
    expect(filterNav(docsNav, "nothing like it")).toEqual([])
  })
})

describe("a page's neighbours", () => {
  it("are the pages before and after it in the navigation, none past either end", () => {
    expect(neighbors("/docs/quick-start")).toMatchObject({
      previous: { href: "/docs/installation" },
      next: { href: "/docs/project-setup" },
    })
    expect(neighbors("/docs/introduction").previous).toBeUndefined()
    expect(neighbors("/docs/nowhere")).toEqual({})
  })
})

describe("search", () => {
  const entries = searchEntries((href) => (href === "/docs/proxy-mode/proxy-caller" ? "Typed client" : ""))

  it("lists every page in the navigation with its section", () => {
    expect(entries).toHaveLength(docsNav.reduce((n, s) => n + s.items.length, 0))
    expect(entries.find((e) => e.href === "/docs/frameworks/hono")?.group).toBe("Framework Guides")
  })

  it("finds every word anywhere, the pages with all of them in the title first", () => {
    const found = searchDocs(entries, "proxy caller")

    expect(found[0]?.title).toBe("createProxyCaller")
    expect(searchDocs(entries, "typed client").map((e) => e.title)).toContain("createProxyCaller")
    expect(searchDocs(entries, "")).toHaveLength(entries.length)
  })
})

describe("reading time", () => {
  it("counts prose at its pace and code at half of it, a minute at least", () => {
    const prose = Array.from({ length: 440 }, () => "word").join(" ")
    const code = ["```ts", Array.from({ length: 440 }, () => "x").join(" "), "```"].join("\n")

    expect(readingMinutes(prose)).toBe(2)
    expect(readingMinutes(`${prose}\n${code}`)).toBe(3)
    expect(readingMinutes("short")).toBe(1)
  })
})
