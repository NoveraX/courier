/**
 * What every page tells search engines and the sites it is shared on: its
 * title, its canonical address and its Open Graph and X tags — and that no
 * two pages of the site read alike in a tab or a search result.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { distinctTitles } from "@/site/content/distinct-titles"
import { findNavContext } from "@/site/content/docs-nav"
import { sourceMetadata } from "@/site/content/source-metadata"
import { exampleMetadata } from "@/site/sandbox/example-metadata"
import { EXAMPLE_PAGES, type ExampleName } from "@/site/sandbox/example-pages"
import { pageMetadata } from "@/site/seo/page-metadata"
import { SITE_PAGES } from "@/site/seo/site-pages"

const APP = fileURLToPath(new URL("../../src/app", import.meta.url))
const DOCS = fileURLToPath(new URL("../../src/content/docs", import.meta.url))

function docPages(dir = DOCS): { href: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return docPages(file)
    if (!entry.name.endsWith(".mdx")) return []
    const href = `/docs/${path.relative(DOCS, file).slice(0, -".mdx".length)}`
    return [{ href, source: readFileSync(file, "utf8") }]
  })
}

describe("a page's metadata", () => {
  const page = { path: "/docs/quick-start", title: "Quick Start", description: "Install it." }

  it("names the page's address as its canonical URL", () => {
    expect(pageMetadata(page).alternates?.canonical).toBe("/docs/quick-start")
  })

  it("writes Open Graph in full, since a page's replaces the layout's", () => {
    expect(pageMetadata({ ...page, section: "Getting Started" }).openGraph).toMatchObject({
      type: "article",
      section: "Getting Started",
      url: "/docs/quick-start",
      siteName: "Courier",
      locale: "en_US",
      title: "Quick Start — Courier Docs",
      description: "Install it.",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    })
  })

  it("leaves the home page its own card, which Next.js names with its hash", () => {
    const home = pageMetadata({ ...SITE_PAGES.home, standalone: true })
    expect(home.openGraph).not.toHaveProperty("images")
    expect(home.openGraph).toMatchObject({ type: "website", url: "/" })
  })

  it("leaves a docs page's title to the layout's template, and keeps a landing page's whole", () => {
    expect(pageMetadata(page).title).toBe("Quick Start")
    const landing = pageMetadata({ ...SITE_PAGES.studio, standalone: true })
    expect(landing.title).toEqual({ absolute: SITE_PAGES.studio.title })
    expect(landing.openGraph).toMatchObject({ type: "website", title: SITE_PAGES.studio.title })
  })

  it("gives X the same title and description, with a large image", () => {
    expect(pageMetadata(page).twitter).toEqual({
      card: "summary_large_image",
      title: "Quick Start — Courier Docs",
      description: "Install it.",
    })
  })
})

describe("the titles pages go by", () => {
  it("keep a title no other page has, and add the section to one that is shared", () => {
    const titles = distinctTitles([
      { href: "/a", title: "Streaming", section: "Advanced" },
      { href: "/b", title: "Streaming", section: "React Query" },
      { href: "/c", title: "Quick Start", section: "Getting Started" },
    ])
    expect([...titles.values()]).toEqual([
      "Streaming (Advanced)",
      "Streaming (React Query)",
      "Quick Start",
    ])
  })

  it("never repeat across the docs and the examples", () => {
    const docs = docPages().map(({ href, source }) => ({
      href,
      title: sourceMetadata(source).title ?? "",
      section: findNavContext(href)?.section.label,
    }))
    const examples = Object.keys(EXAMPLE_PAGES)
      .filter((name): name is ExampleName => name in EXAMPLE_PAGES)
      .map((name) => String(exampleMetadata(name).title))
    const titles = [...distinctTitles(docs).values(), ...examples]
    expect(docs.every(({ title }) => title !== "")).toBe(true)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it("say an examples page is an example, under the Examples section", () => {
    expect(exampleMetadata("streaming")).toMatchObject({
      title: "Streaming example",
      alternates: { canonical: "/docs/examples/streaming" },
      openGraph: { type: "article", section: "Examples" },
    })
  })
})

describe("the pages the metadata names", () => {
  it("are every examples page there is, and no other", () => {
    const routes = readdirSync(path.join(APP, "docs/examples"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    expect(Object.keys(EXAMPLE_PAGES).sort()).toEqual(routes.sort())
  })

  it("are pages the site serves", () => {
    for (const { path: address } of Object.values(SITE_PAGES)) {
      expect(existsSync(path.join(APP, address, "page.tsx")), address).toBe(true)
    }
  })
})
