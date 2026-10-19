import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"

import type { NavItem } from "@/site/content/docs-nav"

/** A link to another page, drawn as a card: the pager's, and the not-found page's. */
export const PAGE_CARD =
  "block rounded-panel border border-line bg-panel px-4 py-3.5 text-fg transition-colors hover:border-line-strong"

/**
 * The foot of a docs page: the pages before and after it in the docs.
 *
 * @param props - The page before and the page after, where there are any
 * @returns The links
 * @example
 * ```tsx
 * <DocsPager {...neighbors("/docs/quick-start")} />
 * ```
 */
export function DocsPager({ previous, next }: { previous?: NavItem; next?: NavItem }) {
  if (!previous && !next) return null
  return (
    <nav
      aria-label="Previous and next pages"
      className="mt-11 grid grid-cols-1 gap-2.5 border-t border-line pt-6 min-[620px]:grid-cols-2"
    >
      {previous ? (
        <Link href={previous.href} className={PAGE_CARD}>
          <span className="flex items-center gap-1.5 text-label text-fg-subtle">
            <ArrowLeft aria-hidden="true" className="size-3" />
            Previous
          </span>
          <span className="mt-1 block text-callout font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className={`${PAGE_CARD} text-right`}>
          <span className="flex items-center justify-end gap-1.5 text-label text-fg-subtle">
            Next
            <ArrowRight aria-hidden="true" className="size-3" />
          </span>
          <span className="mt-1 block text-callout font-medium">{next.title}</span>
        </Link>
      )}
    </nav>
  )
}
