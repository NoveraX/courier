import { Menu, Search } from "lucide-react"
import Link from "next/link"
import type { Ref } from "react"

import { cn } from "@/site/cn"
import { CourierMark } from "@/site/courier-mark"
import { GitHubMark } from "@/site/github-mark"
import { ThemeSwitch } from "./theme-switch"

/** The part of the site a page belongs to. */
export type SitePart = "docs" | "api"

const PARTS: readonly { part: SitePart; label: string; href: string }[] = [
  { part: "docs", label: "Docs", href: "/docs/introduction" },
  { part: "api", label: "API", href: "/reference" },
]

interface SiteHeaderProps {
  /** The part the page is in, lit in the switch beside the logo. */
  part: SitePart
  onSearch: () => void
  onMenu: () => void
  /** The Search button, which search gives focus back to as it closes. */
  searchRef?: Ref<HTMLButtonElement>
  /** The Menu button, which the menu gives focus back to as it closes. */
  menuRef?: Ref<HTMLButtonElement>
}

/**
 * The header of the docs and the API reference alike: the logo with a
 * switch between the two parts beside it, the current one lit, then search
 * over both, the theme and GitHub — and, on a narrow screen, the menu.
 *
 * @param props - The part the page is in, what Search and Menu open, and the buttons themselves
 * @returns The header
 * @example
 * ```tsx
 * <SiteHeader part="docs" onSearch={openSearch} onMenu={openMenu} searchRef={searchButton} menuRef={menuButton} />
 * ```
 */
export function SiteHeader({ part, onSearch, onMenu, searchRef, menuRef }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-70 border-b border-line bg-(--site-header) backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1520px] items-center gap-3.5 px-6 min-[640px]:gap-5">
        <Link href={"/"} className="-mx-2.5 flex items-center gap-2.25 self-stretch px-2.5 text-fg">
          <CourierMark width={19} />
          <span className="hidden text-[14.5px] font-semibold tracking-[-0.02em] min-[400px]:inline">
            courier
          </span>
        </Link>
        <nav
          aria-label="Site part"
          className="flex items-center rounded-control border border-line bg-panel p-0.5"
        >
          {PARTS.map((item) => (
            <Link
              key={item.part}
              href={item.href}
              aria-current={item.part === part ? "page" : undefined}
              className={cn(
                "flex h-6.5 items-center rounded-[6px] px-2.75 text-control transition-colors",
                item.part === part ? "bg-raised font-medium text-fg" : "text-fg-muted hover:text-fg"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          ref={searchRef}
          type="button"
          aria-label="Search the docs and the API"
          onClick={onSearch}
          className="flex size-7.5 cursor-pointer items-center justify-center rounded-control border border-line bg-panel text-control text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted min-[640px]:w-auto min-[640px]:justify-start min-[640px]:gap-7.5 min-[640px]:pr-2 min-[640px]:pl-2.75"
        >
          <Search aria-hidden="true" className="size-3.25" />
          <span className="hidden min-[640px]:inline">Search</span>
          <kbd className="hidden rounded-[4px] border border-line px-1.25 py-px font-mono text-micro min-[640px]:inline">
            ⌘K
          </kbd>
        </button>
        <div className="hidden min-[640px]:block">
          <ThemeSwitch size="header" />
        </div>
        <a
          href="https://github.com/NoveraX/courier"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Courier on GitHub"
          className="-m-1.5 hidden p-1.5 text-fg-muted transition-colors hover:text-fg min-[480px]:flex"
        >
          <GitHubMark />
        </a>
        <button
          ref={menuRef}
          type="button"
          aria-label="Menu"
          onClick={onMenu}
          className="grid size-7.5 cursor-pointer place-items-center rounded-control border border-line bg-panel text-fg-muted transition-colors hover:border-line-strong hover:text-fg min-[1000px]:hidden"
        >
          <Menu aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </header>
  )
}
