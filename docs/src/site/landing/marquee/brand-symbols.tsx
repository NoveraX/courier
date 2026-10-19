import type { Brand } from "@/site/landing/brands"

/**
 * The id a brand's mark goes by in the page's sprite.
 *
 * @param brand - The brand
 * @returns The id, from its name
 * @example
 * ```ts
 * brandSymbolId(ADAPTER_BRANDS[0]) // "brand-next-js"
 * ```
 */
export function brandSymbolId(brand: Brand): string {
  const slug = brand.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `brand-${slug}`
}

/**
 * Every brand's mark written once into the page, as a symbol its tiles
 * draw by reference: the marquee repeats each tile four times to loop, and
 * a mark's outline runs to six kilobytes.
 *
 * @param props - The brands whose marks the page draws
 * @returns The sprite, drawn nowhere itself
 * @example
 * ```tsx
 * <BrandSymbols brands={[...ADAPTER_BRANDS, ...RUNTIME_BRANDS]} />
 * ```
 */
export function BrandSymbols({ brands }: { brands: readonly Brand[] }) {
  return (
    <svg aria-hidden="true" focusable="false" className="absolute size-0 overflow-hidden">
      <defs>
        {brands.map((brand) => (
          <symbol key={brand.name} id={brandSymbolId(brand)} viewBox="0 0 24 24">
            <path fill="currentColor" d={brand.path} />
          </symbol>
        ))}
      </defs>
    </svg>
  )
}
