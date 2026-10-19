"use client"

import { useEffect, useState } from "react"

import type { SearchEntry } from "@/site/content/search-index"
import { SEARCH_INDEX_PATH, searchIndexOf } from "@/site/content/search-index-file"

/* One request for the whole visit: every palette, on every page, reads the same index. */
let loading: Promise<SearchEntry[] | null> | undefined

async function fetchIndex(): Promise<SearchEntry[] | null> {
  const response = await fetch(SEARCH_INDEX_PATH)
  if (!response.ok) throw new Error(`The search index answered ${response.status}`)
  return searchIndexOf(await response.json())
}

function loadIndex(): Promise<SearchEntry[] | null> {
  loading ??= fetchIndex().catch((error: unknown) => {
    /* The next time search opens, it asks again. */
    loading = undefined
    console.error("Search could not load its index", error)
    return null
  })
  return loading
}

/** What search has of its index: the entries once they have loaded, and whether loading them failed. */
export interface SearchIndexState {
  entries: readonly SearchEntry[] | null
  failed: boolean
}

/**
 * The pages and exports search finds, fetched once the page is idle — or
 * at once when the palette opens first — so no page carries the index in
 * its own HTML. A load that failed is tried again as the palette opens.
 *
 * @param open - Whether the palette is open
 * @returns The entries, `null` until they load, and whether the last try failed
 * @example
 * ```ts
 * const { entries, failed } = useSearchIndex(open)
 * ```
 */
export function useSearchIndex(open: boolean): SearchIndexState {
  const [entries, setEntries] = useState<readonly SearchEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (entries) return
    let current = true
    const load = () => {
      setFailed(false)
      void loadIndex().then((index) => {
        if (!current) return
        if (index) setEntries(index)
        setFailed(index === null)
      })
    }
    if (open) load()
    const idle = open ? undefined : window.setTimeout(load, 1500)
    return () => {
      current = false
      window.clearTimeout(idle)
    }
  }, [open, entries])
  return { entries, failed }
}
