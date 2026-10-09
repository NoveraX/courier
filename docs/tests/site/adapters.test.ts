/**
 * The landing page's adapter list says only the import and one call
 * differ between frameworks. Each adapter's code must name the package it
 * claims, and exactly those two lines must be its own. The page shows the
 * most used ones, each with its guide, and leads to an overview of all.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { docsNav } from "@/site/content/docs-nav"
import {
  ADAPTERS,
  ADAPTERS_OVERVIEW,
  LANDING_ADAPTERS,
  landingAdapters,
  ownLines,
} from "@/site/landing/frameworks/adapters"

function docsPage(href: string): string {
  return readFileSync(new URL(`../../src/content${href}.mdx`, import.meta.url), "utf8")
}

describe("the adapters on the landing page", () => {
  it("lists every official server adapter once", () => {
    expect(ADAPTERS.map((a) => a.pkg)).toEqual([
      "@noverax/courier-next",
      "@noverax/courier-nuxt",
      "@noverax/courier-sveltekit",
      "@noverax/courier-astro",
      "@noverax/courier-remix",
      "@noverax/courier-solid",
      "@noverax/courier-hono",
      "@noverax/courier-express",
      "@noverax/courier-fastify",
      "@noverax/courier-nestjs",
    ])
  })

  it("names each framework as the one command's --framework takes it, as its page documents", () => {
    const row = docsPage("/docs/create-courier")
      .split("\n")
      .find((line) => line.startsWith("| `--framework <name>`"))

    for (const adapter of ADAPTERS) expect(row).toContain(`\`${adapter.framework}\``)
  })

  it.each(ADAPTERS)("imports $label's handler from its own package, on two lines", (adapter) => {
    const { own, last } = ownLines(adapter)

    expect(adapter.code).toContain(`from "${adapter.pkg}"`)
    expect(own.filter(Boolean)).toHaveLength(2)
    expect(last).toBeGreaterThan(own.indexOf(true))
  })
})

describe("the landing page's adapter count", () => {
  it("matches the words that name it: ten adapters, in the list and on the tiles", async () => {
    const { ADAPTER_BRANDS } = await import("@/site/landing/brands")

    expect(ADAPTERS).toHaveLength(10)
    expect(ADAPTER_BRANDS.map((b) => b.name)).toEqual(ADAPTERS.map((a) => a.label))
  })
})

describe("the adapters the landing page shows", () => {
  it("are six official ones, Next.js first, the rest on the overview", () => {
    expect(landingAdapters().map((a) => a.label)).toEqual([...LANDING_ADAPTERS])
    expect(landingAdapters()).toHaveLength(6)
    expect(landingAdapters()[0]?.label).toBe("Next.js")
  })

  it.each(ADAPTERS)("lead to $label's guide, a page in the docs' navigation", (adapter) => {
    const pages = docsNav.flatMap((section) => section.items.map((item) => item.href))

    expect(pages).toContain(adapter.guide)
    expect(docsPage(adapter.guide)).toContain(adapter.pkg)
  })
})

describe("the adapters overview", () => {
  it("lists every official adapter with its package and its guide", () => {
    const overview = docsPage(ADAPTERS_OVERVIEW)

    for (const adapter of ADAPTERS) {
      expect(overview).toContain(`\`${adapter.pkg}\``)
      expect(overview).toContain(`](${adapter.guide})`)
    }
  })
})
