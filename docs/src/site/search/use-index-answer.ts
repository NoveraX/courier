"use client"

import { useEffect, useRef, useState } from "react"

import { searchDocsIndex } from "./docsearch-client"
import type { SearchGroup } from "./search-types"
import type { IndexAnswer } from "./search-view"

/* Answers kept for the page's life, so typing back to an earlier query
   shows its results at once; the oldest go first. */
const KEPT_ANSWERS = 40
const answers = new Map<string, SearchGroup[]>()

function keepAnswer(query: string, groups: SearchGroup[]): void {
  answers.set(query, groups)
  const oldest = answers.keys().next()
  if (answers.size > KEPT_ANSWERS && !oldest.done) answers.delete(oldest.value)
}

type Answered = (next: (previous: IndexAnswer) => IndexAnswer) => void

async function askIndex(query: string, answered: Answered): Promise<void> {
  try {
    const groups = await searchDocsIndex(query)
    keepAnswer(query, groups)
    answered(() => ({ status: "done", groups }))
  } catch (error) {
    console.warn("Search could not reach the docs' index; it matches page titles instead", error)
    answered((previous) => ({ ...previous, status: "failed" }))
  }
}

/**
 * The docs' index's answer to what was typed, kept while the next is on
 * its way. Only the answer to the latest query is taken: one that arrives
 * after the reader has typed on is dropped.
 *
 * @param query - What was typed
 * @returns Where the search stands, and the latest answer's groups
 * @example
 * ```tsx
 * const answer = useIndexAnswer(query)
 * answer.status // "searching"
 * ```
 */
export function useIndexAnswer(query: string): IndexAnswer {
  const [answer, setAnswer] = useState<IndexAnswer>({ status: "idle", groups: null })
  const latest = useRef(0)
  const typed = query.trim()
  useEffect(() => {
    const ticket = ++latest.current
    const answered: Answered = (next) => {
      if (ticket === latest.current) setAnswer(next)
    }
    const kept = answers.get(typed)
    if (!typed) answered((previous) => ({ ...previous, status: "idle" }))
    else if (kept) answered(() => ({ status: "done", groups: kept }))
    else {
      answered((previous) => ({ ...previous, status: "searching" }))
      void askIndex(typed, answered)
    }
  }, [typed])
  return answer
}
