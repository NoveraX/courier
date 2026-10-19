"use client"

import { useCallback, useEffect, useState } from "react"

import type { RecentSearch } from "./recent-searches"
import { browserStorage, forgetRecent, readRecent, rememberRecent } from "./recent-searches"
import type { SearchOption } from "./search-types"

/** The results opened from search lately, and how to add or clear them. */
export interface RecentSearches {
  items: RecentSearch[]
  remember: (option: SearchOption) => void
  clear: () => void
}

/**
 * The results opened from search lately, read again each time search
 * opens — another tab may have opened some since.
 *
 * @param open - Whether search is open
 * @returns The recent results, and what keeps or clears them
 * @example
 * ```tsx
 * const recent = useRecentSearches(open)
 * recent.remember(option)
 * ```
 */
export function useRecentSearches(open: boolean): RecentSearches {
  const [items, setItems] = useState<RecentSearch[]>([])
  useEffect(() => {
    if (open) setItems(readRecent(browserStorage()))
  }, [open])
  const remember = useCallback((option: SearchOption) => {
    setItems(rememberRecent(browserStorage(), option))
  }, [])
  const clear = useCallback(() => setItems(forgetRecent(browserStorage())), [])
  return { items, remember, clear }
}
