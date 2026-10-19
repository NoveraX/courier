"use client"

import { useRef, useState } from "react"

import { SearchDialog } from "@/site/search/search-dialog"
import { useSearchDialog } from "@/site/search/use-search-dialog"
import { MobileDrawer } from "./mobile-drawer"
import { ReadingProgress } from "./reading-progress"
import type { SitePart } from "./site-header"
import { SiteHeader } from "./site-header"

/**
 * What surrounds every docs page: the reading progress, the header, and
 * the search over the docs and the API and the menu it opens — ⌘K or
 * Ctrl+K opens search anywhere, and `/` where nothing is being typed.
 *
 * @param props - The part of the site
 * @returns The chrome
 * @example
 * ```tsx
 * <DocsChrome part="docs" />
 * ```
 */
export function DocsChrome({ part }: { part: SitePart }) {
  const search = useSearchDialog()
  const [menu, setMenu] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  return (
    <>
      <ReadingProgress />
      <SiteHeader
        part={part}
        onSearch={() => search.setOpen(true)}
        onMenu={() => setMenu(true)}
        searchRef={search.opener}
        menuRef={menuButton}
      />
      <SearchDialog open={search.open} onOpenChange={search.setOpen} returnTo={search.opener} />
      <MobileDrawer open={menu} onOpenChange={setMenu} returnTo={menuButton} />
    </>
  )
}
