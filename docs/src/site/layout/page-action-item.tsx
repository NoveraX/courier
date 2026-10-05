import { ArrowUpRight } from "lucide-react"
import type { ReactNode } from "react"

interface PageActionItemProps {
  /** A Lucide icon, or a brand's mark: drawn in the tile's muted colour unless it has its own. */
  icon: (props: { className?: string }) => ReactNode
  title: string
  /** What the action is for, under its title. */
  sub: string
  /** Whether it opens another site. */
  external?: boolean | undefined
}

/**
 * The inside of an entry of a page's actions menu: its icon in a tile, its
 * title — marked when it leads off the site — and what it is for.
 *
 * @param props - The icon, the title, what it is for, and whether it leads off the site
 * @returns The entry's content
 * @example
 * ```tsx
 * <PageActionItem icon={Copy} title="Copy page as Markdown" sub="Paste the whole page into any LLM" />
 * ```
 */
export function PageActionItem({ icon: Icon, title, sub, external }: PageActionItemProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-line bg-bg-subtle text-fg-muted"
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-nav">
          {title}
          {external && <ArrowUpRight aria-hidden="true" className="size-2.75 text-fg-subtle" />}
        </span>
        <span className="text-label leading-[1.4] text-fg-subtle">{sub}</span>
      </span>
    </>
  )
}
