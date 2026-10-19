"use client"

import { useRef, useState } from "react"

import { MobileDrawer } from "./mobile-drawer"
import { ReadingProgress } from "./reading-progress"
import { SearchPalette } from "./search-palette"
import type { SitePart } from "./site-header"
import { SiteHeader } from "./site-header"
import { useSearchShortcut } from "./use-search-shortcut"

/**
 * What surrounds every docs page: the reading progress, the header, and
 * the search over the docs and the API and the menu it opens — ⌘K or
 * Ctrl+K opens search anywhere.
 *
 * @param props - The part of the site
 * @returns The chrome
 * @example
 * ```tsx
 * <DocsChrome part="docs" />
 * ```
 */
export function DocsChrome({ part }: { part: SitePart }) {
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState(false)
  const searchButton = useRef<HTMLButtonElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  useSearchShortcut(setSearching)
  return (
    <>
      <ReadingProgress />
      <SiteHeader
        part={part}
        onSearch={() => setSearching(true)}
        onMenu={() => setMenu(true)}
        searchRef={searchButton}
        menuRef={menuButton}
      />
      <SearchPalette open={searching} onOpenChange={setSearching} returnTo={searchButton} />
      <MobileDrawer open={menu} onOpenChange={setMenu} returnTo={menuButton} />
    </>
  )
}
