import type { CSSProperties } from "react"

import { cn } from "@/site/cn"
import { BrandIcon } from "@/site/landing/brand-icon"
import type { Brand } from "@/site/landing/brands"
import { isPale, rgbOf } from "@/site/landing/brands"

/**
 * A brand as a tile: its mark on a tinted square, its name, and what
 * Courier offers it. Hovering rings it in the brand's colour.
 *
 * @param props - The brand
 * @returns The tile
 * @example
 * ```tsx
 * <BrandTile brand={ADAPTER_BRANDS[0]} />
 * ```
 */
export function BrandTile({ brand }: { brand: Brand }) {
  const glow: CSSProperties & Record<"--brand-rgb", string> = {
    "--brand-rgb": rgbOf(brand.hex).join(" "),
  }
  return (
    <div
      style={glow}
      className="flex h-16 items-center gap-3 rounded-[14px] border border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-bg-subtle))] pr-5 pl-3 whitespace-nowrap transition-[border-color,box-shadow] duration-250 hover:border-[rgb(var(--brand-rgb)/0.45)] hover:shadow-[0_14px_34px_-18px_rgb(var(--brand-rgb)/0.45)]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-[rgb(var(--brand-rgb)/0.1)]">
        <span
          className={cn(isPale(brand.hex) && "text-fg")}
          style={isPale(brand.hex) ? undefined : { color: brand.hex }}
        >
          <BrandIcon path={brand.path} className="block size-5" />
        </span>
      </span>
      <span className="flex flex-col gap-0.75">
        <span className="text-[14px] font-medium tracking-[-0.015em] text-fg">{brand.name}</span>
        <span className="font-mono text-meta tracking-normal text-fg-subtle">{brand.sub}</span>
      </span>
    </div>
  )
}
