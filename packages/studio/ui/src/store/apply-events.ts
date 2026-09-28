import type { Catalog } from "./types-ui"
import type { EventPayload } from "./actions-event-utils"
import type { RequestEntry } from "./types"
import type { RequestDraft } from "./request-draft"

import { normalizeEventSource, shouldIgnoreRequest } from "./actions-event-utils"
import { str } from "./event-helpers"
import { applyEvent } from "./handle-event"
import { createRequestDraft } from "./request-draft"

export interface ApplyEventsOptions {
  /** How many requests the list keeps; the oldest beyond it are dropped. */
  maxRequests: number
  /** Patterns of requests the user chose not to record. */
  ignorePatterns: string[]
  /** Whether recording is paused: no new request is recorded, the ones shown still end. */
  paused: boolean
}

/* Source names are matched case-insensitively against a catalogue of known
   names; with this empty one, each passes as sent. */
const NO_CATALOG: Catalog = {}

/**
 * Fold a batch of runtime events into the request list at once.
 *
 * @param requests - The list as the store holds it, newest first
 * @param events - The events, oldest first
 * @param options - The cap, the ignore patterns, and whether recording is paused
 * @returns The next list — the same array when no event changed it — and
 *   how many old requests the cap dropped
 *
 * @example
 * ```ts
 * const { requests, droppedCount } = applyEvents(state.requests, batch, {
 *   maxRequests: 2000,
 *   ignorePatterns: [],
 *   paused: false,
 * })
 * ```
 */
export function applyEvents(
  requests: RequestEntry[],
  events: EventPayload[],
  options: ApplyEventsOptions,
): { requests: RequestEntry[]; droppedCount: number } {
  const draft = createRequestDraft(requests)
  for (const event of events) {
    if (isRecorded(event, draft, options)) applyEvent(draft, normalizeEventSource(event, NO_CATALOG))
  }
  return draft.finish(options.maxRequests)
}

/** Whether an event is taken in: a new request is not while paused, nor one the user ignores. */
function isRecorded(event: EventPayload, draft: RequestDraft, options: ApplyEventsOptions): boolean {
  if (event.type === "request:start") {
    return !options.paused && !shouldIgnoreRequest(event, options.ignorePatterns)
  }
  if (event.type === "stream:open") return !options.paused || draft.has(str(event.requestId))
  return true
}
