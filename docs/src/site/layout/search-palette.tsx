"use client"

import { useRouter } from "next/navigation"
import { Dialog } from "radix-ui"
import type { RefObject } from "react"
import { useId, useRef, useState } from "react"

import { cn } from "@/site/cn"
import type { SearchEntry } from "@/site/content/search-index"
import { searchDocs } from "@/site/content/search-index"
import { useReturnFocus } from "@/site/use-return-focus"
import { useSearchIndex } from "./use-search-index"

/* What the palette says when the index would not load; opening it again tries again. */
const SEARCH_FAILED = "Search could not load the pages. Close it and open it again."

interface SearchPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The header's Search, which focus goes back to when nothing else had it. */
  returnTo?: RefObject<HTMLElement | null>
}

/**
 * Search over the docs and the API reference, as ⌘K or the header's
 * Search opens it: typed words narrow the pages and exports, ↑ ↓ move
 * through them, ↵ opens one. Closed without opening one, it gives focus
 * back to where it was. The pages and exports come from the search index
 * the site serves, fetched once the page is idle.
 *
 * @param props - Whether the palette is open, and the Search that opens it
 * @returns The palette
 * @example
 * ```tsx
 * <SearchPalette open={open} onOpenChange={setOpen} returnTo={searchButton} />
 * ```
 */
export function SearchPalette({ open, onOpenChange, returnTo }: SearchPaletteProps) {
  const router = useRouter()
  const id = useId()
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState(0)
  const dismissed = useRef(false)
  const returnFocus = useReturnFocus(returnTo, { shortcut: true })
  const { entries, failed } = useSearchIndex(open)
  const results = entries ? searchDocs(entries, query) : []
  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return
    returnFocus.leave()
    onOpenChange(false)
    router.push(entry.href)
  }
  const move = (by: number) =>
    setChosen((at) => (results.length === 0 ? 0 : (at + by + results.length) % results.length))
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        dismissed.current = !next
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-scrim fixed inset-0 z-90 bg-(--site-scrim) backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={returnFocus.remember}
          onCloseAutoFocus={(event) => {
            returnFocus.restore(event)
            /* A dismissed search starts afresh, but only once the palette has
               gone: cleared sooner, its list would change while it closes. */
            if (!dismissed.current) return
            dismissed.current = false
            setQuery("")
            setChosen(0)
          }}
          className="overlay-dialog fixed top-[13dvh] left-1/2 z-91 w-[min(540px,calc(100vw-40px))] -translate-x-1/2 overflow-hidden rounded-panel border border-line-strong bg-panel shadow-dialog"
        >
          <Dialog.Title className="sr-only">Search the docs and the API</Dialog.Title>
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-results`}
            aria-activedescendant={results[chosen] ? `${id}-${chosen}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setChosen(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                move(e.key === "ArrowDown" ? 1 : -1)
              } else if (e.key === "Enter") go(results[chosen])
            }}
            placeholder="Search the docs and the API…"
            className="h-12 w-full border-0 border-b border-line bg-transparent px-4 text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Pages and exports"
            className="max-h-[min(20rem,40dvh)] overflow-y-auto p-1.5"
          >
            {results.map((entry, at) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox's ↑ ↓ ↵ drive the options
              <div
                key={entry.href}
                id={`${id}-${at}`}
                role="option"
                tabIndex={-1}
                aria-selected={at === chosen}
                onMouseMove={() => setChosen(at)}
                onClick={() => go(entry)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-control px-2.75 py-2.25 text-fg",
                  at === chosen && "bg-raised"
                )}
              >
                <span className="min-w-18.5 text-[11px] text-fg-subtle">{entry.group}</span>
                <span className="text-[14px]">{entry.title}</span>
              </div>
            ))}
            {results.length === 0 && (
              <p className="m-0 px-2.75 py-6 text-center text-control text-fg-subtle">
                {entries ? "No pages match" : failed ? SEARCH_FAILED : "Loading…"}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
