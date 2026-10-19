"use client"

import { Dialog } from "radix-ui"
import type { RefObject } from "react"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import type { SearchEntry } from "@/site/content/search-index"
import { useReturnFocus } from "@/site/use-return-focus"
import { preloadDocsSearch } from "./docsearch-client"
import { SearchBox } from "./search-box"
import { SearchEmpty } from "./search-empty"
import { SearchFooter } from "./search-footer"
import { optionDomId, SearchList } from "./search-list"
import { searchView } from "./search-view"
import { useIndexAnswer } from "./use-index-answer"
import { useRecentSearches } from "./use-recent-searches"
import { useSearchActions } from "./use-search-actions"
import { useSearchChoice } from "./use-search-choice"

interface SearchDialogProps {
  /** The pages and exports the site lists itself, to browse and to fall back on. */
  entries: readonly SearchEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The header's Search, which focus goes back to when nothing else had it. */
  returnTo?: RefObject<HTMLElement | null>
}

function announcement(typed: string, searching: boolean, count: number): string {
  if (!typed) return ""
  if (searching) return "Searching…"
  return `${count} ${count === 1 ? "result" : "results"}`
}

/**
 * Search over every page of the docs and the API reference, as ⌘K or the
 * header's Search opens it: typed words find headings and passages through
 * DocSearch, ↑ ↓ move through them, ↵ opens one — with ⌘ or Ctrl, in a new
 * tab. With nothing typed it lists the results opened lately and every
 * page to browse. Closed without opening a result — Esc, a click beside
 * it, ⌘K again — it gives focus back and starts afresh the next time;
 * after a result, it opens on the same search.
 *
 * @param props - The site's pages and exports, whether search is open, and the Search that opens it
 * @returns The dialog
 * @example
 * ```tsx
 * <SearchDialog entries={entries} open={open} onOpenChange={setOpen} returnTo={searchButton} />
 * ```
 */
export function SearchDialog({ entries, open, onOpenChange, returnTo }: SearchDialogProps) {
  const listId = `${useId()}-results`
  const [query, setQuery] = useState("")
  const followed = useRef(false)
  const returnFocus = useReturnFocus(returnTo, { shortcut: true })
  const answer = useIndexAnswer(query)
  const recent = useRecentSearches(open)
  const view = useMemo(
    () => searchView({ query, answer, entries, recent: recent.items }),
    [query, answer, entries, recent.items]
  )
  const options = useMemo(() => view.groups.flatMap((group) => group.options), [view])
  const choice = useSearchChoice(options.length, answer, query)
  /* ↑ ↓ bring the result they pick into view; the pointer picks what it
     is already over, which stays where it is. */
  const keyed = useRef(false)
  const move = (by: number) => {
    keyed.current = true
    choice.move(by)
  }
  const close = () => {
    followed.current = true
    onOpenChange(false)
  }
  const actions = useSearchActions({
    options,
    choice: { ...choice, move },
    recent,
    returnFocus,
    close,
  })
  const typed = query.trim()
  const activeId = choice.active < 0 ? undefined : optionDomId(listId, choice.active)
  useEffect(() => {
    if (open) preloadDocsSearch()
  }, [open])
  useEffect(() => {
    if (!keyed.current || !activeId) return
    keyed.current = false
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" })
  }, [activeId])
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-scrim fixed inset-0 z-90 bg-(--site-scrim) backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={returnFocus.remember}
          onCloseAutoFocus={(event) => {
            returnFocus.restore(event)
            /* A dismissed search starts afresh, but only once the dialog has
               gone: cleared sooner, its list would change while it closes. */
            if (followed.current) followed.current = false
            else setQuery("")
          }}
          className="overlay-dialog fixed top-[13dvh] left-1/2 z-91 flex max-h-[min(36rem,74dvh)] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-panel border border-line-strong bg-panel shadow-dialog max-[640px]:top-4 max-[640px]:max-h-[calc(100dvh-32px)]"
        >
          <Dialog.Title className="sr-only">Search the docs and the API</Dialog.Title>
          <SearchBox
            value={query}
            onChange={setQuery}
            onKeyDown={actions.onKeyDown}
            listId={listId}
            activeId={activeId}
            searching={view.searching}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            <SearchList
              id={listId}
              groups={view.groups}
              active={choice.active}
              onPoint={choice.pick}
              onOpen={actions.onOpen}
            />
            {typed && options.length === 0 && !view.searching && <SearchEmpty query={typed} />}
          </div>
          <SearchFooter
            titlesOnly={view.titlesOnly}
            onClearRecent={!typed && recent.items.length > 0 ? recent.clear : undefined}
          />
          <p aria-live="polite" className="sr-only">
            {announcement(typed, view.searching, options.length)}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
