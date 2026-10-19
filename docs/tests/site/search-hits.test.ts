/**
 * The records the docs' index answers become search's list: under each
 * section, the results of one page kept together, best first; one place
 * offered once; and every link a path on this site, or a web page's
 * address elsewhere.
 */
import { describe, expect, it } from "vitest"

import type { DocSearchRecord, DocSearchType } from "@/site/search/docsearch-record"
import { HIGHLIGHT_CLOSE, HIGHLIGHT_OPEN } from "@/site/search/highlight-parts"
import { groupHits, hrefOf } from "@/site/search/search-hits"

const SITE = "https://courier.noverax.cloud"

function record(
  objectID: string,
  type: DocSearchType,
  url: string,
  levels: Partial<DocSearchRecord["hierarchy"]>,
  extra: Partial<DocSearchRecord> = {}
): DocSearchRecord {
  return {
    objectID,
    type,
    url: `${SITE}${url}`,
    content: null,
    hierarchy: {
      lvl0: "Proxy Mode",
      lvl1: null,
      lvl2: null,
      lvl3: null,
      lvl4: null,
      lvl5: null,
      lvl6: null,
      ...levels,
    },
    ...extra,
  }
}

describe("where a result leads", () => {
  it("is a path for a page of the site, its anchor kept", () => {
    expect(hrefOf(`${SITE}/docs/installation#requirements`)).toBe("/docs/installation#requirements")
  })

  it("opens a page at its top rather than at its main column", () => {
    expect(hrefOf(`${SITE}/docs/installation#main-content`)).toBe("/docs/installation")
  })

  it("is the whole address for a web page elsewhere", () => {
    expect(hrefOf("https://example.com/guide#a")).toBe("https://example.com/guide#a")
  })

  it("is no link for an address that is not a web page's, or does not parse", () => {
    expect(hrefOf("javascript:alert(1)")).toBeNull()
    expect(hrefOf("data:text/html,<b>x</b>")).toBeNull()
    expect(hrefOf("http://[bad")).toBeNull()
  })
})

describe("the list search shows", () => {
  it("titles a heading by itself and places it under its page", () => {
    const [group] = groupHits([
      record("1", "lvl2", "/docs/proxy-mode/expose#marking-endpoints", {
        lvl1: "Exposing Endpoints",
        lvl2: "Marking endpoints",
      }),
    ])

    expect(group?.label).toBe("Proxy Mode")
    expect(group?.options[0]).toMatchObject({
      href: "/docs/proxy-mode/expose#marking-endpoints",
      title: [{ text: "Marking endpoints", matched: false }],
      trail: ["Exposing Endpoints"],
      kind: "heading",
    })
  })

  it("titles a passage by its snippet, the matches marked, under every heading above it", () => {
    const passage = record(
      "2",
      "content",
      "/docs/proxy-mode/expose#the-shapes",
      { lvl1: "Exposing Endpoints", lvl2: "The shapes" },
      {
        content: "Each endpoint says how the client reaches it.",
        _snippetResult: {
          content: {
            value: `Each endpoint says how the ${HIGHLIGHT_OPEN}client${HIGHLIGHT_CLOSE}…`,
          },
        },
      }
    )

    expect(groupHits([passage])[0]?.options[0]).toMatchObject({
      title: [
        { text: "Each endpoint says how the ", matched: false },
        { text: "client", matched: true },
        { text: "…", matched: false },
      ],
      trail: ["Exposing Endpoints", "The shapes"],
      kind: "text",
    })
  })

  it("keeps a page's results together under its section, in the order they ranked", () => {
    const groups = groupHits([
      record("a1", "lvl1", "/docs/a", { lvl1: "A" }),
      record("b1", "lvl1", "/docs/b", { lvl1: "B" }),
      record("a2", "lvl2", "/docs/a#two", { lvl1: "A", lvl2: "Two" }),
      record("c1", "lvl1", "/docs/c", { lvl0: "Testing", lvl1: "C" }),
    ])

    expect(groups.map((group) => group.label)).toEqual(["Proxy Mode", "Testing"])
    expect(groups[0]?.options.map((option) => option.id)).toEqual(["a1", "a2", "b1"])
  })

  it("offers one place once, under the page's own heading rather than its document title", () => {
    const groups = groupHits([
      record("title", "lvl1", "/docs/api/create-proxy-caller", {
        lvl1: "createProxyCaller — Courier Docs",
      }),
      record("heading", "lvl1", "/docs/api/create-proxy-caller#main-content", {
        lvl1: "createProxyCaller",
      }),
    ])

    expect(groups[0]?.options).toHaveLength(1)
    expect(groups[0]?.options[0]).toMatchObject({
      id: "title",
      href: "/docs/api/create-proxy-caller",
      title: [{ text: "createProxyCaller", matched: false }],
    })
  })

  it("files a record with no section under Documentation", () => {
    const [group] = groupHits([record("1", "lvl1", "/docs/a", { lvl0: null, lvl1: "A" })])

    expect(group?.label).toBe("Documentation")
  })

  it("leaves out a record whose address is no web page's", () => {
    const unsafe = { ...record("1", "lvl1", "/docs/a", { lvl1: "A" }), url: "javascript:alert(1)" }

    expect(groupHits([unsafe])).toEqual([])
  })
})
