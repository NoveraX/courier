/**
 * The landing page's adapter list says only the import and one call
 * differ between frameworks. Each adapter's code must name the package it
 * claims, and exactly those two lines must be its own.
 */
import { describe, expect, it } from "vitest"

import { ADAPTERS, ownLines } from "@/site/landing/frameworks/adapters"

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
