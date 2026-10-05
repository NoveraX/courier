import Link from "next/link"

import { cn } from "@/site/cn"

/**
 * The way to Courier Studio's own page, marked new: a pill in the accent.
 *
 * @param props - Its size: in the navigation, or alone in the bar
 * @returns The link
 * @example
 * ```tsx
 * <StudioPill size="nav" />
 * ```
 */
export function StudioPill({ size }: { size: "nav" | "bar" }) {
  return (
    <Link
      href={"/studio"}
      className={cn(
        "flex shrink-0 items-center rounded-full border border-brand/35 bg-brand/10 font-[550] whitespace-nowrap text-brand transition-colors hover:bg-brand/18 hover:text-brand",
        size === "nav"
          ? "-my-1 h-6.5 gap-1.75 pr-2.5 pl-2"
          : "h-7.5 gap-1.5 pr-2.5 pl-1.5 text-control"
      )}
    >
      <NewBadge />
      Studio
    </Link>
  )
}

/**
 * The small "New" badge that marks something just added.
 *
 * @returns The badge
 * @example
 * ```tsx
 * <NewBadge />
 * ```
 */
export function NewBadge() {
  return (
    <span className="rounded-full bg-brand px-1.5 py-0.75 text-[10px] leading-none font-medium tracking-[0.03em] text-bg">
      New
    </span>
  )
}
