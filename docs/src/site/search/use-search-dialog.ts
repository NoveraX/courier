"use client"

import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

import { searchShortcutOf } from "./search-shortcuts"

/** Whether search is open, and the header's Search that opens it. */
export interface SearchDialogState {
  open: boolean
  setOpen: (open: boolean) => void
  /** The header's Search, which focus goes back to as search closes. */
  opener: RefObject<HTMLButtonElement | null>
}

/**
 * Search over the docs and the API, opened from a page's header or from
 * anywhere with its shortcuts: ⌘K or Ctrl+K opens and closes it, `/`
 * opens it unless the reader is typing in a field.
 *
 * @returns Whether search is open, its setter, and the Search button's ref
 * @example
 * ```tsx
 * const search = useSearchDialog()
 * <SiteHeader onSearch={() => search.setOpen(true)} searchRef={search.opener} />
 * <SearchDialog open={search.open} onOpenChange={search.setOpen} returnTo={search.opener} />
 * ```
 */
export function useSearchDialog(): SearchDialogState {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = searchShortcutOf(event)
      if (!shortcut) return
      event.preventDefault()
      setOpen((was) => (shortcut === "toggle" ? !was : true))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return { open, setOpen, opener }
}
