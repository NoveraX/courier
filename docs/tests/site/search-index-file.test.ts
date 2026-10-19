/**
 * The search index a page fetches from the site rather than carrying it:
 * read only when every entry has its title, address, section and
 * description, and names the page it is a part of, if at all, in words.
 */
import { describe, expect, it } from "vitest"

import { SEARCH_INDEX_PATH, searchIndexOf } from "@/site/content/search-index-file"

const ENTRY = {
  title: "Quick Start",
  href: "/docs/quick-start",
  group: "Getting Started",
  description: "D",
}

describe("the search index file", () => {
  it("is served at one address", () => {
    expect(SEARCH_INDEX_PATH).toBe("/search-index.json")
  })

  it("is read when every entry is whole", () => {
    expect(searchIndexOf([ENTRY])).toEqual([ENTRY])
    expect(searchIndexOf([])).toEqual([])
  })

  it("is read with the page an entry is a part of", () => {
    const onThePage = { ...ENTRY, href: "/reference#define", page: "API reference" }

    expect(searchIndexOf([onThePage])).toEqual([onThePage])
  })

  it("is refused when it is anything else", () => {
    expect(searchIndexOf({ entries: [ENTRY] })).toBeNull()
    expect(searchIndexOf([{ ...ENTRY, href: 3 }])).toBeNull()
    expect(searchIndexOf([{ title: "T" }])).toBeNull()
    expect(searchIndexOf([{ ...ENTRY, page: 3 }])).toBeNull()
    expect(searchIndexOf(null)).toBeNull()
  })
})
