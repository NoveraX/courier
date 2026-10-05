"use client"

import { useState } from "react"

import type { SearchEntry } from "@/site/content/search-index"
import { MobileDrawer } from "./mobile-drawer"
import { ReadingProgress } from "./reading-progress"
import { SearchPalette } from "./search-palette"
import { SiteHeader } from "./site-header"
import { useSearchShortcut } from "./use-search-shortcut"

/**
 * What surrounds every docs page: the reading progress, the header, and
 * the search and the menu it opens — ⌘K or Ctrl+K opens search anywhere.
 *
 * @param props - The part of the site, and every page search can find
 * @returns The chrome
 * @example
 * ```tsx
 * <DocsChrome label="Docs" entries={entries} />
 * ```
 */
export function DocsChrome({ label, entries }: { label: string; entries: readonly SearchEntry[] }) {
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState(false)
  useSearchShortcut(setSearching)
  return (
    <>
      <ReadingProgress />
      <SiteHeader label={label} onSearch={() => setSearching(true)} onMenu={() => setMenu(true)} />
      <SearchPalette entries={entries} open={searching} onOpenChange={setSearching} />
      <MobileDrawer open={menu} onOpenChange={setMenu} />
    </>
  )
}
