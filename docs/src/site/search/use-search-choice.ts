"use client"

import { useState } from "react"

/** Which result of the list is picked, and how the reader moves the choice. */
export interface SearchChoice {
  /** The picked result's position, or -1 while nothing is listed. */
  active: number
  pick: (at: number) => void
  move: (by: number) => void
}

interface Chosen {
  at: number
  /** The results the choice was made among. */
  among: unknown
  query: string
}

/**
 * The result picked in search's list: the first one each time the results
 * or the query change, ↑ ↓ moving the choice round past either end, the
 * pointer picking the result it is over.
 *
 * @param count - How many results are listed
 * @param among - The answer the results come from: a new one picks the first again
 * @param query - What was typed
 * @returns The choice
 * @example
 * ```tsx
 * const choice = useSearchChoice(options.length, answer, query)
 * ```
 */
export function useSearchChoice(count: number, among: unknown, query: string): SearchChoice {
  const [chosen, setChosen] = useState<Chosen>({ at: 0, among, query })
  const last = count - 1
  const current = (was: Chosen) => (was.among === among && was.query === query ? was.at : 0)
  return {
    active: count === 0 ? -1 : Math.min(current(chosen), last),
    /* The pointer picks on every move: the same pick keeps the same state,
       so the list is not drawn again. */
    pick: (at) => setChosen((was) => (current(was) === at ? was : { at, among, query })),
    move: (by) =>
      setChosen((was) => ({
        at: count === 0 ? 0 : (Math.min(current(was), last) + by + count) % count,
        among,
        query,
      })),
  }
}
