import type { Catalog } from "./types-ui"
import type { EventPayload } from "./actions-event-utils"
import type { RequestEntry } from "./types"

import { normalizeEventSource, shouldIgnoreRequest } from "./actions-event-utils"
import { applyEvent } from "./handle-event"
import { createRequestDraft } from "./request-draft"

export interface ApplyEventsOptions {
  /** How many requests the list keeps; the oldest beyond it are dropped. */
  maxRequests: number
  /** Patterns of requests the user chose not to record. */
  ignorePatterns: string[]
}

/* Source names are matched case-insensitively against a catalogue of known
   names; with this empty one, each passes as sent. */
const NO_CATALOG: Catalog = {}

/**
 * Fold a batch of runtime events into the request list at once.
 *
 * @param requests - The list as the store holds it, newest first
 * @param events - The events, oldest first
 * @param options - The cap and the ignore patterns
 * @returns The next list — the same array when no event changed it — and
 *   how many old requests the cap dropped
 *
 * @example
 * ```ts
 * const { requests, droppedCount } = applyEvents(state.requests, batch, { maxRequests: 2000, ignorePatterns: [] })
 * ```
 */
export function applyEvents(
  requests: RequestEntry[],
  events: EventPayload[],
  { maxRequests, ignorePatterns }: ApplyEventsOptions,
): { requests: RequestEntry[]; droppedCount: number } {
  const draft = createRequestDraft(requests)
  for (const event of events) {
    if (event.type === "request:start" && shouldIgnoreRequest(event, ignorePatterns)) continue
    applyEvent(draft, normalizeEventSource(event, NO_CATALOG))
  }
  return draft.finish(maxRequests)
}
