/**
 * Search on the API reference finds its exports, each leading to its own
 * section of the reference, ahead of the docs pages it also finds.
 */
import { describe, expect, it } from "vitest"

import { searchDocs } from "@/site/content/search-index"
import { referenceSearchEntries } from "@/site/reference/reference-search"

const exports = [
  { id: "create-caller", name: "createCaller", desc: "Direct mode." },
  { id: "call-options", name: "CallOptions", desc: "The options one call takes." },
]

describe("search on the API reference", () => {
  it("leads each export to its own section of the reference", () => {
    expect(referenceSearchEntries(exports)).toEqual([
      {
        title: "createCaller",
        href: "/reference#create-caller",
        group: "This page",
        description: "Direct mode.",
      },
      {
        title: "CallOptions",
        href: "/reference#call-options",
        group: "This page",
        description: "The options one call takes.",
      },
    ])
  })

  it("finds an export ahead of the docs page of the same name", () => {
    const entries = [
      ...referenceSearchEntries(exports),
      {
        title: "createCaller",
        href: "/docs/api/create-caller",
        group: "API Reference",
        description: "Direct mode.",
      },
    ]

    expect(searchDocs(entries, "createcaller").map((entry) => entry.href)).toEqual([
      "/reference#create-caller",
      "/docs/api/create-caller",
    ])
  })
})
