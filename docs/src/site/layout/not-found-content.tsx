import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { PAGE_CARD } from "./docs-pager"

/** Where a reader who followed a dead link most likely meant to go. */
export const NOT_FOUND_PLACES: readonly { label: string; title: string; href: string }[] = [
  { label: "Start here", title: "What is Courier?", href: "/docs/introduction" },
  { label: "Set it up", title: "Quick Start", href: "/docs/quick-start" },
  { label: "Look it up", title: "API reference", href: "/reference" },
  { label: "Go back", title: "Courier's home page", href: "/" },
]

/**
 * What an address with no page shows, in the docs' own style: that the
 * page is not there, that search above can find it, and the pages a reader
 * most likely meant.
 *
 * @returns The page's content
 * @example
 * ```tsx
 * <NotFoundContent />
 * ```
 */
export function NotFoundContent() {
  return (
    <main id="main-content" className="min-w-0 max-w-[820px] pt-10 pb-27.5">
      <header className="border-b border-line pb-6.5">
        <p className="m-0 mb-5 font-mono text-control text-brand">404</p>
        <h1 className="m-0 text-h1 font-semibold tracking-h1 text-fg">Page not found</h1>
        <p className="m-0 mt-4 max-w-[64ch] text-lead text-fg-muted">
          No page is at this address: it may have moved, or the link may be mistyped. Search the
          docs from the bar above, or start from one of these.
        </p>
      </header>
      <nav
        aria-label="Pages to go to instead"
        className="mt-8 grid grid-cols-1 gap-2.5 min-[620px]:grid-cols-2"
      >
        {NOT_FOUND_PLACES.map(({ label, title, href }) => (
          <Link key={href} href={href} className={PAGE_CARD}>
            <span className="flex items-center gap-1.5 text-label text-fg-subtle">
              {label}
              <ArrowRight aria-hidden="true" className="size-3" />
            </span>
            <span className="mt-1 block text-callout font-medium">{title}</span>
          </Link>
        ))}
      </nav>
    </main>
  )
}
