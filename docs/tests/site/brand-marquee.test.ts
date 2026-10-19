/**
 * The marquee of frameworks and runtimes repeats each tile to loop, and
 * draws each brand's mark from one symbol in the page, so a mark's outline
 * is sent once however many tiles show it.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ADAPTER_BRANDS, RUNTIME_BRANDS } from "@/site/landing/brands"
import { BrandMarquee } from "@/site/landing/marquee/brand-marquee"
import { brandSymbolId } from "@/site/landing/marquee/brand-symbols"

const BRANDS = [...ADAPTER_BRANDS, ...RUNTIME_BRANDS]

describe("the brand marquee", () => {
  const html = renderToStaticMarkup(createElement(BrandMarquee))

  it("writes each brand's outline once", () => {
    for (const brand of BRANDS) {
      expect(html.split(brand.path).length - 1, brand.name).toBe(1)
    }
  })

  it("draws every tile from a symbol the page has, four times a brand to loop", () => {
    const uses = [...html.matchAll(/<use href="#([^"]+)"/g)].map((match) => match[1])
    const symbols = [...html.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(symbols).size).toBe(BRANDS.length)
    expect(uses).toHaveLength(BRANDS.length * 4)
    for (const id of uses) expect(symbols).toContain(id)
  })

  it("names each brand's symbol after it, one name a brand", () => {
    const nextjs = BRANDS.find((brand) => brand.name === "Next.js")
    expect(nextjs && brandSymbolId(nextjs)).toBe("brand-next-js")
    expect(new Set(BRANDS.map(brandSymbolId)).size).toBe(BRANDS.length)
  })
})
