import { Menu, Search } from "lucide-react"
import Link from "next/link"

import { CourierMark } from "@/site/courier-mark"
import { ThemeSwitch } from "@/site/layout/theme-switch"

interface ReferenceHeaderProps {
  filter: string
  onFilter: (filter: string) => void
  /** How many exports the filter leaves. */
  shown: number
  /** How many there are. */
  total: number
  onMenu: () => void
  /** Opens search, which a phone has in place of the filter. */
  onSearch: () => void
}

/**
 * The bar across the top of the API reference: Courier's mark leading
 * home, the exports list on a narrow screen, a filter over the exports with
 * how many it leaves — search over the exports and the docs on a phone,
 * which has no room for it — the docs and the colour theme.
 *
 * @param props - The filter, what typing does, how many exports it leaves of how many, and what opens the list and search
 * @returns The header
 * @example
 * ```tsx
 * <ReferenceHeader filter={filter} onFilter={setFilter} shown={9} total={12} onMenu={openList} onSearch={openSearch} />
 * ```
 */
export function ReferenceHeader({
  filter,
  onFilter,
  shown,
  total,
  onMenu,
  onSearch,
}: ReferenceHeaderProps) {
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6.5 px-6">
        <Link href={"/"} className="flex items-center gap-2.25 text-fg">
          <CourierMark width={19} />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em]">courier</span>
        </Link>
        <span className="hidden text-nav text-fg-muted min-[640px]:inline">API reference</span>
        <button
          type="button"
          onClick={onMenu}
          className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-control border border-line bg-panel px-2.75 text-control text-fg-muted transition-colors hover:border-line-strong hover:text-fg min-[1000px]:hidden"
        >
          <Menu aria-hidden="true" className="size-3.25" />
          Exports
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="grid size-7.5 cursor-pointer place-items-center rounded-control border border-line bg-panel text-fg-muted transition-colors hover:border-line-strong hover:text-fg min-[640px]:hidden"
        >
          <Search aria-hidden="true" className="size-3.5" />
        </button>
        <label className="hidden h-7.5 w-55 max-w-[40vw] items-center gap-2 rounded-control border border-line bg-panel pr-2 pl-2.5 text-fg-subtle min-[640px]:flex">
          <Search aria-hidden="true" className="size-3.25 shrink-0" />
          <input
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="Filter exports"
            aria-label="Filter exports"
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
          />
          <span className="rounded-[4px] border border-line px-1.25 py-px font-mono text-micro tabular-nums">
            {shown === total ? total : `${shown}/${total}`}
          </span>
        </label>
        <Link
          href={"/docs/introduction"}
          className="hidden text-nav text-fg-muted transition-colors hover:text-fg min-[480px]:inline"
        >
          Docs
        </Link>
        <div className="hidden min-[640px]:block">
          <ThemeSwitch size="header" />
        </div>
      </div>
    </header>
  )
}
