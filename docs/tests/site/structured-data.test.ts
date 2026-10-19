/**
 * The structured data each page hands search engines: who publishes
 * Courier, the site, Courier as source code, the page itself and the way
 * to it — every pointer within a page's graph leading to one of its nodes.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { sourceMetadata } from "@/site/content/source-metadata"
import { EXAMPLE_PAGES } from "@/site/sandbox/example-pages"
import { jsonLdText } from "@/site/seo/json-ld"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { breadcrumbList } from "@/site/seo/structured-data/breadcrumbs"
import type { JsonLdNode } from "@/site/seo/structured-data/json-ld-node"
import { STUDIO_PACKAGE } from "@/site/seo/structured-data/packages"
import {
  docsGraph,
  homeGraph,
  landingGraph,
  referenceGraph,
} from "@/site/seo/structured-data/page-graphs"

const DOCS = fileURLToPath(new URL("../../src/content/docs", import.meta.url))
const SITE = "https://courier.noverax.cloud"

/* The address is made of the folder names, as the site makes it: a path
   relative to the docs holds backslashes on Windows. */
function docPages(dir = DOCS, address = "/docs"): { href: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return docPages(file, `${address}/${entry.name}`)
    if (!entry.name.endsWith(".mdx")) return []
    const href = `${address}/${entry.name.slice(0, -".mdx".length)}`
    return [{ href, source: readFileSync(file, "utf8") }]
  })
}

function pointers(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(pointers)
  if (typeof value !== "object" || value === null) return []
  const entries = Object.entries(value)
  if (entries.length === 1 && entries[0]?.[0] === "@id") return [String(entries[0][1])]
  return entries.flatMap(([key, inner]) => (key === "@id" ? [] : pointers(inner)))
}

function expectWhole(graph: JsonLdNode[]): void {
  const ids = graph.map((node) => node["@id"])
  expect(new Set(ids).size, "every node has an id of its own").toBe(graph.length)
  for (const pointer of pointers(graph)) expect(ids, pointer).toContain(pointer)
  for (const url of JSON.stringify(graph).match(/https?:\/\/[^"]+/g) ?? []) {
    expect(url.startsWith("https://"), url).toBe(true)
  }
}

function crumbs(graph: JsonLdNode[]): [string, string][] {
  const list = graph.find((node) => node["@type"] === "BreadcrumbList")
  const items = (list?.itemListElement ?? []) as { name: string; item: string }[]
  return items.map(({ name, item }) => [name, item.replace(SITE, "")])
}

describe("a page's structured data as script text", () => {
  it("is schema.org JSON with every < escaped, reading back as the same graph", () => {
    const graph: JsonLdNode[] = [{ "@type": "Thing", name: "</script><b>" }]
    const text = jsonLdText(graph)
    expect(text).not.toContain("<")
    expect(JSON.parse(text)).toEqual({ "@context": "https://schema.org", "@graph": graph })
  })
})

describe("the graphs", () => {
  it("describe the home page as a page about Courier, published by NoveraX", () => {
    const graph = homeGraph("0.3.0")
    expect(graph.map((node) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "SoftwareSourceCode",
      "WebPage",
    ])
    expect(graph[1]).toMatchObject({
      name: "Courier",
      alternateName: ["Courier by NoveraX", "@noverax/courier"],
    })
    expect(graph[2]).toMatchObject({
      name: "Courier",
      alternateName: "@noverax/courier",
      version: "0.3.0",
      codeRepository: "https://github.com/NoveraX/courier/tree/master/packages/core",
    })
    expectWhole(graph)
  })

  it("describe a docs page as an article, on the way through the docs and its section", () => {
    const page = {
      path: "/docs/core-concepts/caller",
      title: "Caller",
      description: "How a call is made.",
      updated: "2026-10-14",
    }
    const graph = docsGraph(page, "0.3.0")
    expect(graph.find((node) => node["@type"] === "TechArticle")).toMatchObject({
      headline: "Caller",
      dateModified: "2026-10-14",
      articleSection: "Core Concepts",
      image: `${SITE}/og/docs/core-concepts/caller`,
    })
    expect(crumbs(graph)).toEqual([
      ["Courier", "/"],
      ["Docs", "/docs/introduction"],
      ["Core Concepts", "/docs/core-concepts/defining-apis"],
      ["Caller", "/docs/core-concepts/caller"],
    ])
    expectWhole(graph)
  })

  it("leave out a step that leads where another one, or the page, already does", () => {
    const intro = { path: "/docs/introduction", title: "What is Courier?", description: "D" }
    const why = { path: "/docs/why-courier", title: "Why Courier?", description: "D" }
    expect(crumbs(docsGraph(intro, "0.3.0"))).toEqual([
      ["Courier", "/"],
      ["What is Courier?", "/docs/introduction"],
    ])
    expect(crumbs(docsGraph(why, "0.3.0")).map(([name]) => name)).toEqual([
      "Courier",
      "Docs",
      "Why Courier?",
    ])
    expect(() => breadcrumbList([])).toThrow(/needs the page/)
  })

  it("describe a landing page as about its package, and the reference as an article", () => {
    const studio = landingGraph(SITE_PAGES.studio, STUDIO_PACKAGE, "0.3.0")
    expect(studio.find((node) => node["@type"] === "WebPage")?.about).toEqual({
      "@id": `${SITE}/studio#software`,
    })
    expect(crumbs(studio)).toEqual([
      ["Courier", "/"],
      ["Courier Studio", "/studio"],
    ])
    const reference = referenceGraph("2026-10-14", "0.3.0")
    expect(reference.find((node) => node["@type"] === "TechArticle")?.dateModified).toBe(
      "2026-10-14"
    )
    expectWhole(studio)
    expectWhole(reference)
  })

  it("are whole for every docs page and example", () => {
    const pages = [
      ...docPages().map(({ href, source }) => ({ href, ...sourceMetadata(source) })),
      ...Object.entries(EXAMPLE_PAGES).map(([name, page]) => ({
        href: `/docs/examples/${name}`,
        ...page,
      })),
    ]
    for (const { href, title = "", description = "", ...rest } of pages) {
      const updated = "updated" in rest ? rest.updated : undefined
      const graph = docsGraph({ path: href, title, description, updated }, "0.3.0")
      expectWhole(graph)
      expect(crumbs(graph).at(-1), href).toEqual([title, href])
    }
  })
})
