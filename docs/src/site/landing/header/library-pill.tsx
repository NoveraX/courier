import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import { cn } from "@/site/cn"
import { CourierMark } from "@/site/courier-mark"

/**
 * The way from a product's page back to the Courier library's: a pill in
 * the accent with Courier's mark — only the mark where the bar is narrow,
 * its name still read out.
 *
 * @param props - Its classes, which say from which width it shows
 * @returns The link
 * @example
 * ```tsx
 * <LibraryPill className="hidden min-[820px]:flex" />
 * ```
 */
export function LibraryPill({ className }: { className?: string }) {
  return (
    <Link
      href={"/"}
      className={cn(
        "h-7.5 shrink-0 items-center gap-1.75 rounded-full border border-brand/35 bg-brand-dim px-1.5 text-control font-[550] whitespace-nowrap text-brand hover:bg-brand/18 hover:text-brand min-[960px]:pr-2.75 min-[960px]:pl-1.75",
        className
      )}
    >
      <span className="grid size-4.5 place-items-center rounded-full bg-brand text-bg">
        <CourierMark width={10} />
      </span>
      <span className="max-[960px]:sr-only">Courier library</span>
      <ArrowUpRight aria-hidden="true" className="hidden size-3 min-[960px]:block" />
    </Link>
  )
}
