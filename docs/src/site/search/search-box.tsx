"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import type { KeyboardEvent } from "react"
import { useRef } from "react"

/* The longest query the search answers. */
const QUERY_LIMIT = 512

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /** The list of results the box drives. */
  listId: string
  /** The result picked in the list, as its element's id. */
  activeId: string | undefined
  /** An answer is on its way. */
  searching: boolean
}

/**
 * Where search is typed: the list of results under it is moved through
 * with ↑ ↓ from here, and a result opened with ↵. A spinner shows when an
 * answer takes a moment; Clear empties the box and keeps typing in it.
 *
 * @param props - The text, what changes and keys do, and the list it drives
 * @returns The box
 * @example
 * ```tsx
 * <SearchBox value={query} onChange={setQuery} onKeyDown={onKey} listId={id} activeId={chosen} searching={false} />
 * ```
 */
export function SearchBox({
  value,
  onChange,
  onKeyDown,
  listId,
  activeId,
  searching,
}: SearchBoxProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex h-12 shrink-0 items-center gap-2.75 border-b border-line pr-2.5 pl-4">
      <Search aria-hidden="true" className="size-3.75 shrink-0 text-fg-subtle" />
      <input
        ref={input}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label="Search the docs and the API"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={QUERY_LIMIT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search the docs and the API…"
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
      />
      {searching && (
        <span className="animate-[overlay-fade-in_0.15s_ease_0.3s_both]">
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 text-fg-subtle motion-safe:animate-spin"
          />
        </span>
      )}
      {value && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            onChange("")
            input.current?.focus()
          }}
          className="grid size-6.5 shrink-0 cursor-pointer place-items-center rounded-[7px] text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
        >
          <X aria-hidden="true" className="size-3.25" />
        </button>
      )}
    </div>
  )
}
