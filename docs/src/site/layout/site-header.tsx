import { Menu, Search } from "lucide-react"
import Link from "next/link"

import { CourierMark } from "@/site/courier-mark"
import { GitHubMark } from "@/site/github-mark"
import { ThemeSwitch } from "./theme-switch"

interface SiteHeaderProps {
  /** What the header names beside the logo: "Docs", "API reference". */
  label: string
  onSearch: () => void
  onMenu: () => void
}

/**
 * The bar across the top of the docs: Courier's mark leading home, the
 * part of the site this is, the menu on a narrow screen, search with its
 * shortcut, the API reference, the colour theme and the repository.
 *
 * @param props - The part of the site, and what opens search and the menu
 * @returns The header
 * @example
 * ```tsx
 * <SiteHeader label="Docs" onSearch={openSearch} onMenu={openMenu} />
 * ```
 */
export function SiteHeader({ label, onSearch, onMenu }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1520px] items-center gap-6.5 px-6">
        <Link href={"/"} className="flex items-center gap-2.25 text-fg">
          <CourierMark width={19} />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em]">courier</span>
        </Link>
        <span className="hidden text-nav text-fg-muted min-[640px]:inline">{label}</span>
        <button
          type="button"
          onClick={onMenu}
          className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-control border border-line bg-panel px-2.75 text-control text-fg-muted transition-colors hover:border-line-strong hover:text-fg min-[1000px]:hidden"
        >
          <Menu aria-hidden="true" className="size-3.25" />
          Menu
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Search documentation"
          onClick={onSearch}
          className="flex size-7.5 cursor-pointer items-center justify-center rounded-control border border-line bg-panel text-control text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted min-[640px]:w-auto min-[640px]:justify-start min-[640px]:gap-7.5 min-[640px]:pr-2 min-[640px]:pl-2.75"
        >
          <Search aria-hidden="true" className="size-3.25" />
          <span className="hidden min-[640px]:inline">Search</span>
          <kbd className="hidden rounded-[4px] border border-line px-1.25 py-px font-mono text-micro min-[640px]:inline">
            ⌘K
          </kbd>
        </button>
        <Link
          href={"/reference"}
          className="hidden text-nav text-fg-muted transition-colors hover:text-fg min-[560px]:inline"
        >
          API
        </Link>
        <div className="hidden min-[640px]:block">
          <ThemeSwitch size="header" />
        </div>
        <a
          href="https://github.com/NoveraX/courier"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Courier on GitHub"
          className="flex text-fg-muted transition-colors hover:text-fg"
        >
          <GitHubMark />
        </a>
      </div>
    </header>
  )
}
