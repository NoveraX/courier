import Link from "next/link"

import { cn } from "@/site/cn"
import { TopLink } from "@/site/top-link"
import { NewBadge } from "./new-badge"

const TONES = {
  brand: "border-brand/35 bg-brand/10 text-brand hover:bg-brand/18 hover:text-brand",
  violet:
    "border-tone-violet/35 bg-tone-violet/10 text-tone-violet hover:bg-tone-violet/18 hover:text-tone-violet",
} as const

/* The pill of the page the header is on stands out, so the reader sees where they are. */
const CURRENT = {
  brand: "border-brand/75 bg-brand/16",
  violet: "border-tone-violet/75 bg-tone-violet/16",
} as const

/** A product with a page of its own, which the header leads to. */
export interface Product {
  href: "/studio" | "/mcp"
  label: string
  tone: keyof typeof TONES
}

/** Courier's two products with pages of their own: Studio in the accent, the MCP server in violet. */
export const PRODUCTS: readonly Product[] = [
  { href: "/studio", label: "Studio", tone: "brand" },
  { href: "/mcp", label: "MCP", tone: "violet" },
]

/**
 * The way to one of Courier's products' own pages, marked new: a pill in the
 * product's colour. On the product's own page it is marked as the current
 * page and takes the reader back to its top.
 *
 * @param props - The product, and whether the header is on its page
 * @returns The link
 * @example
 * ```tsx
 * <ProductPill product={PRODUCTS[0]} current />
 * ```
 */
export function ProductPill({ product, current = false }: { product: Product; current?: boolean }) {
  const className = cn(
    "-my-1 flex h-6.5 shrink-0 items-center gap-1.75 rounded-full border pr-2.5 pl-2 font-[550] whitespace-nowrap transition-colors",
    TONES[product.tone],
    current && CURRENT[product.tone]
  )
  if (current) {
    return (
      <TopLink href={product.href} current className={className}>
        <NewBadge tone={product.tone} />
        {product.label}
      </TopLink>
    )
  }
  return (
    <Link href={product.href} className={className}>
      <NewBadge tone={product.tone} />
      {product.label}
    </Link>
  )
}
