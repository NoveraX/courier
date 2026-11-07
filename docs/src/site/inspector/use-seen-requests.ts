"use client"

import { useSyncExternalStore } from "react"

import { NetworkLog, type ResourceEntry, type SeenRequest } from "./network-log"

const NONE: readonly SeenRequest[] = []
/* The most clicks and keys kept, to tell what caused a request recorded after them. */
const MOST_ACTIONS = 50

/** A click or a key on the page, and the sandbox it was in, if any. */
interface Action {
  readonly at: number
  readonly sandbox: Element | undefined
}

/* The page's one log, fed by one observer of the browser's records, made the first time an
   inspector asks for it: the requests made before then come with the buffered records. */
let pageLog: NetworkLog | undefined
const actions: Action[] = []

function noteAction(event: Event): void {
  const sandbox = event.target instanceof Element ? event.target.closest("[data-sandbox]") : null
  actions.push({ at: performance.now(), sandbox: sandbox ?? undefined })
  if (actions.length > MOST_ACTIONS) actions.shift()
}

/* The sandbox whose control the visitor last used before `start`: what sent a request then. A
   click outside every sandbox — a link, the page's menu — leaves the page itself the cause. */
function causeOf(start: number): Element | undefined {
  return actions.findLast((action) => action.at <= start)?.sandbox
}

function log(): NetworkLog {
  if (pageLog !== undefined) return pageLog
  const made = new NetworkLog()
  pageLog = made
  if (typeof PerformanceObserver === "undefined") return made
  document.addEventListener("pointerdown", noteAction, true)
  document.addEventListener("keydown", noteAction, true)
  const observer = new PerformanceObserver((list) => {
    const { origin, pathname } = window.location
    made.add(list.getEntries() as unknown as ResourceEntry[], { origin, pathname }, causeOf)
  })
  observer.observe({ type: "resource", buffered: true })
  return made
}

/**
 * The requests the page made that the inspector shows, as the browser
 * recorded them — the proxy route's, and Server Actions' — each with the
 * sandbox whose control sent it, where one did. The page renders none on
 * the server, where no browser recorded any.
 *
 * @returns The requests, oldest first
 * @example
 * ```tsx
 * const requests = useSeenRequests()
 * ```
 */
export function useSeenRequests(): readonly SeenRequest[] {
  return useSyncExternalStore(
    (listener) => log().subscribe(listener),
    () => log().requests,
    () => NONE
  )
}
