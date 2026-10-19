"use client"

import { useRouter } from "next/navigation"
import type { KeyboardEvent, MouseEvent } from "react"

import type { ReturnFocus } from "@/site/use-return-focus"
import type { SearchOption } from "./search-types"
import type { RecentSearches } from "./use-recent-searches"
import type { SearchChoice } from "./use-search-choice"

interface SearchActionsInput {
  /** Every result listed, in order. */
  options: readonly SearchOption[]
  choice: SearchChoice
  recent: RecentSearches
  returnFocus: ReturnFocus
  close: () => void
}

/** What the search box's keys and a click on a result do. */
export interface SearchActions {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onOpen: (option: SearchOption, event: MouseEvent<HTMLAnchorElement>) => void
}

/* A click the browser opens elsewhere: another button, or a key that asks
   for a new tab or window. */
function opensElsewhere(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

/**
 * How a result is opened from search: ↑ ↓ move the choice, ↵ opens it —
 * in a new tab with ⌘ or Ctrl — and a click opens what it lands on, as a
 * link does. A result opened is kept among the recent ones; one opened on
 * this page closes search and leaves focus where it leads.
 *
 * @param input - The results, the choice among them, the recent ones, focus and what closes search
 * @returns The handlers for the search box's keys and for a click on a result
 * @example
 * ```tsx
 * const actions = useSearchActions({ options, choice, recent, returnFocus, close })
 * ```
 */
export function useSearchActions({
  options,
  choice,
  recent,
  returnFocus,
  close,
}: SearchActionsInput): SearchActions {
  const router = useRouter()
  const go = (option: SearchOption | undefined, newTab = false) => {
    if (!option) return
    recent.remember(option)
    if (newTab) {
      window.open(option.href, "_blank", "noopener,noreferrer")
      return
    }
    returnFocus.leave()
    close()
    if (option.href.startsWith("/")) router.push(option.href)
    else window.location.assign(option.href)
  }
  return {
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        choice.move(event.key === "ArrowDown" ? 1 : -1)
      } else if (event.key === "Enter") {
        event.preventDefault()
        go(options[choice.active], event.metaKey || event.ctrlKey)
      }
    },
    onOpen: (option, event) => {
      if (opensElsewhere(event)) {
        recent.remember(option)
        return
      }
      event.preventDefault()
      go(option)
    },
  }
}
