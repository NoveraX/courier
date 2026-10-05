"use client"

import { useRouter } from "next/navigation"
import { Dialog } from "radix-ui"
import { useId, useState } from "react"

import { cn } from "@/site/cn"
import type { SearchEntry } from "@/site/content/search-index"
import { searchDocs } from "@/site/content/search-index"

interface SearchPaletteProps {
  entries: readonly SearchEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Search over the docs and the API reference, as ⌘K or the header's
 * Search opens it: typed words narrow the pages and exports, ↑ ↓ move
 * through them, ↵ opens one.
 *
 * @param props - The pages and exports, and whether the palette is open
 * @returns The palette
 * @example
 * ```tsx
 * <SearchPalette entries={entries} open={open} onOpenChange={setOpen} />
 * ```
 */
export function SearchPalette({ entries, open, onOpenChange }: SearchPaletteProps) {
  const router = useRouter()
  const id = useId()
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState(0)
  const results = searchDocs(entries, query)
  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return
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
        setQuery("")
        setChosen(0)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-90 bg-(--site-scrim) backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[13vh] left-1/2 z-91 w-[min(540px,calc(100vw-40px))] -translate-x-1/2 animate-site-in overflow-hidden rounded-panel border border-line-strong bg-panel shadow-dialog"
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
            className="max-h-80 overflow-y-auto p-1.5"
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
                No pages match
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
