import type { ReactNode } from "react"
import { PageLink } from "@/site/landing/page-link"

/** A column of a product page's footer: its heading and links. */
export interface ProductFooterColumn {
  heading: string
  /** A page of the site, a section of the page (`#…`) or an outside address. */
  links: readonly { label: string; href: string }[]
}

/* The gap between links is shared out to them, so a finger has more to land on. */
const LINK = "-my-1 py-1 text-control text-fg-subtle hover:text-fg"

/**
 * A product page's footer — Studio's, the MCP server's: the product's
 * name and what it is, and three columns of links, the product's own
 * first.
 *
 * @param props - The product's wordmark, its line, and the columns
 * @returns The footer
 * @example
 * ```tsx
 * <ProductFooter brand={<StudioWordmark />} line="The visual debugger" columns={COLUMNS} />
 * ```
 */
export function ProductFooter({
  brand,
  line,
  columns,
}: {
  brand: ReactNode
  line: string
  columns: readonly ProductFooterColumn[]
}) {
  return (
    <footer className="mt-[clamp(72px,12vw,120px)] border-t border-line bg-bg-subtle">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-9 px-5 pt-13 pb-10 min-[600px]:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          {brand}
          <span className="max-w-[34ch] text-control leading-[1.55] text-fg-subtle">{line}</span>
        </div>
        {columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-2.5">
            <span className="text-label font-semibold text-fg-muted">{column.heading}</span>
            {column.links.map((link) =>
              link.href.startsWith("http") ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  {link.label}
                </a>
              ) : (
                <PageLink key={link.label} href={link.href} className={LINK}>
                  {link.label}
                </PageLink>
              )
            )}
          </nav>
        ))}
      </div>
    </footer>
  )
}
