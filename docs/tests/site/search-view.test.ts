/**
 * What search lists for what was typed: with nothing typed, the results
 * opened lately and every page to browse; while the docs' index answers
 * for the first time, the pages whose titles match; then the index's
 * latest answer, kept while the next is on its way; and when the index
 * cannot be reached, the matching titles, said to be titles alone. Until
 * the site's own pages have arrived, a list made of them says they are on
 * their way, or could not be fetched, rather than that nothing matched.
 * The search sent to the index asks for snippets alone, its matches marked.
 */
import { describe, expect, it } from "vitest"

import type { SearchEntry } from "@/site/content/search-index"
import { HIGHLIGHT_CLOSE, HIGHLIGHT_OPEN } from "@/site/search/highlight-parts"
import { localGroups, markWords, wordPatterns } from "@/site/search/local-results"
import { docsearchRequest } from "@/site/search/search-request"
import type { SearchGroup } from "@/site/search/search-types"
import type { IndexAnswer } from "@/site/search/search-view"
import { RECENT_GROUP, searchView } from "@/site/search/search-view"

const entries: SearchEntry[] = [
  {
    title: "createProxyCaller",
    href: "/reference#create-proxy-caller",
    group: "API Reference",
    description: "",
    page: "API reference",
  },
  {
    title: "Installation",
    href: "/docs/installation",
    group: "Getting Started",
    description: "Install it",
  },
  {
    title: "Proxy Caller",
    href: "/docs/proxy-mode/proxy-caller",
    group: "Proxy Mode",
    description: "",
  },
]

const indexGroups: SearchGroup[] = [
  {
    id: "section:Proxy Mode",
    label: "Proxy Mode",
    options: [{ id: "x", href: "/docs/proxy-mode/expose", title: [], trail: [], kind: "page" }],
  },
]

const recent = [
  { href: "/docs/installation", title: "Installation", trail: [], kind: "page" as const },
]

const answer = (status: IndexAnswer["status"], groups: SearchGroup[] | null): IndexAnswer => ({
  status,
  groups,
})

const pages = { entries, failed: false }
const pagesLoading = { entries: null, failed: false }
const pagesFailed = { entries: null, failed: true }

describe("what search lists", () => {
  it("lists the recent results, then every page, while nothing is typed", () => {
    const view = searchView({ query: "  ", answer: answer("idle", indexGroups), pages, recent })

    expect(view.groups[0]?.id).toBe(RECENT_GROUP)
    expect(view.groups[0]?.options[0]?.id).toBe("recent:/docs/installation")
    expect(view.groups.slice(1).flatMap((group) => group.options)).toHaveLength(3)
    expect(view).toMatchObject({ titlesOnly: false, searching: false, missingPages: null })
  })

  it("lists the matching titles while the index answers for the first time", () => {
    const view = searchView({ query: "proxy", answer: answer("searching", null), pages, recent })

    expect(view.groups.flatMap((group) => group.options).map((option) => option.href)).toEqual([
      "/reference#create-proxy-caller",
      "/docs/proxy-mode/proxy-caller",
    ])
    expect(view).toMatchObject({ titlesOnly: false, searching: true })
  })

  it("keeps the index's latest answer while the next is on its way", () => {
    const view = searchView({
      query: "proxy m",
      answer: answer("searching", indexGroups),
      pages,
      recent,
    })

    expect(view.groups).toBe(indexGroups)
    expect(view.searching).toBe(true)
  })

  it("lists the index's answer once it arrives", () => {
    const view = searchView({
      query: "proxy",
      answer: answer("done", indexGroups),
      pages,
      recent,
    })

    expect(view).toEqual({
      groups: indexGroups,
      titlesOnly: false,
      searching: false,
      missingPages: null,
    })
  })

  it("falls back on the matching titles, said to be titles alone, when the index cannot be reached", () => {
    const view = searchView({
      query: "install",
      answer: answer("failed", indexGroups),
      pages,
      recent,
    })

    expect(view.groups.flatMap((group) => group.options).map((option) => option.href)).toEqual([
      "/docs/installation",
    ])
    expect(view).toMatchObject({ titlesOnly: true, searching: false, missingPages: null })
  })
})

describe("what search lists before the site's pages have arrived", () => {
  it("lists the recent results and says the pages are on their way", () => {
    const view = searchView({
      query: "",
      answer: answer("idle", null),
      pages: pagesLoading,
      recent,
    })

    expect(view.groups.map((group) => group.id)).toEqual([RECENT_GROUP])
    expect(view.missingPages).toBe("loading")
  })

  it("keeps the recent results and says the pages could not be fetched", () => {
    const view = searchView({ query: "", answer: answer("idle", null), pages: pagesFailed, recent })

    expect(view.groups.map((group) => group.id)).toEqual([RECENT_GROUP])
    expect(view.missingPages).toBe("failed")
  })

  it("says the titles are on their way, not that nothing matched, when the index cannot be reached either", () => {
    const view = searchView({
      query: "install",
      answer: answer("failed", null),
      pages: pagesLoading,
      recent,
    })

    expect(view).toEqual({
      groups: [],
      titlesOnly: true,
      searching: false,
      missingPages: "loading",
    })
  })

  it("says the titles could not be fetched when neither they nor the index can be had", () => {
    const view = searchView({
      query: "install",
      answer: answer("failed", null),
      pages: pagesFailed,
      recent,
    })

    expect(view).toMatchObject({ groups: [], titlesOnly: true, missingPages: "failed" })
  })

  it("says only that it searches while the index answers for the first time", () => {
    const view = searchView({
      query: "proxy",
      answer: answer("searching", null),
      pages: pagesFailed,
      recent,
    })

    expect(view).toEqual({ groups: [], titlesOnly: false, searching: true, missingPages: null })
  })

  it("lists the index's answer whatever became of the pages", () => {
    const view = searchView({
      query: "proxy",
      answer: answer("done", indexGroups),
      pages: pagesFailed,
      recent,
    })

    expect(view).toEqual({
      groups: indexGroups,
      titlesOnly: false,
      searching: false,
      missingPages: null,
    })
  })
})

describe("the pages the site lists itself", () => {
  it("marks every place a typed word occurs in a title, whatever its case", () => {
    expect(markWords("Proxy caller for the proxy", wordPatterns("PROXY"))).toEqual([
      { text: "Proxy", matched: true },
      { text: " caller for the ", matched: false },
      { text: "proxy", matched: true },
    ])
    expect(markWords("", wordPatterns("proxy"))).toEqual([])
  })

  it("marks a typed word as written, characters a pattern reserves included", () => {
    expect(markWords("C++ and c.js", wordPatterns("c++ c.js"))).toEqual([
      { text: "C++", matched: true },
      { text: " and ", matched: false },
      { text: "c.js", matched: true },
    ])
  })

  it("marks the title at its own positions where lowering its case would shift them", () => {
    expect(markWords("İstanbul proxy", wordPatterns("proxy"))).toEqual([
      { text: "İstanbul ", matched: false },
      { text: "proxy", matched: true },
    ])
  })

  it("groups them under their sections, an export leading to its section of the reference", () => {
    const groups = localGroups(entries, "proxy caller")

    expect(groups.map((group) => group.label)).toEqual(["API Reference", "Proxy Mode"])
    expect(groups[0]?.options[0]).toMatchObject({ kind: "heading", trail: ["API reference"] })
    expect(groups[1]?.options[0]).toMatchObject({ kind: "page", trail: [] })
  })

  it("lists an export beside the API page of the same name, the export under the page it is on", () => {
    const exportAndPage: SearchEntry[] = [
      {
        title: "createCaller",
        href: "/reference#create-caller",
        group: "API Reference",
        description: "",
        page: "API reference",
      },
      {
        title: "createCaller",
        href: "/docs/api/create-caller",
        group: "API Reference",
        description: "",
      },
    ]

    const groups = localGroups(exportAndPage, "createcaller")

    expect(groups).toHaveLength(1)
    expect(groups[0]?.options.map(({ href, kind, trail }) => ({ href, kind, trail }))).toEqual([
      { href: "/reference#create-caller", kind: "heading", trail: ["API reference"] },
      { href: "/docs/api/create-caller", kind: "page", trail: [] },
    ])
  })
})

describe("the search the index is asked for", () => {
  it("asks for the headings and text of each record, and snippets of them with the matches marked", () => {
    const request = docsearchRequest("retry")

    expect(request).toMatchObject({
      indexName: "Docs",
      query: "retry",
      attributesToHighlight: [],
      highlightPreTag: HIGHLIGHT_OPEN,
      highlightPostTag: HIGHLIGHT_CLOSE,
    })
    expect(request.attributesToRetrieve).toEqual([
      "hierarchy.lvl0",
      "hierarchy.lvl1",
      "hierarchy.lvl2",
      "hierarchy.lvl3",
      "hierarchy.lvl4",
      "hierarchy.lvl5",
      "hierarchy.lvl6",
      "content",
      "type",
      "url",
    ])
    expect(request.attributesToSnippet).toContain("content:15")
    expect(request.attributesToSnippet).not.toContain("hierarchy.lvl0:15")
  })
})
