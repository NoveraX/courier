import type { RequestEntry, StudioEvent } from "./types"
import type { RequestDraft } from "./request-draft"
import { str } from "./event-helpers"
import { validationIssuesOf } from "./validation-issues"
import { withMiddlewareEnter, withMiddlewareExit, withMiddlewareError } from "./handle-middleware-events"
import {
  requestFromStart,
  withFetchStart,
  withProxyClientTiming,
  withRequestEnd,
  withRequestError,
  withValidationFail,
} from "./handle-request-events"
import {
  streamFromOpen,
  withStreamClose,
  withStreamError,
  withStreamMessage,
  withStreamOpen,
} from "./handle-stream-events"

type EventPayload = StudioEvent & Record<string, unknown>

/**
 * Fold one runtime event into the request list being drafted. Events for a
 * request the list does not hold, and events the list has nothing to show
 * for, change nothing.
 *
 * @param draft - The request list a batch of events is changing
 * @param event - The runtime event
 *
 * @example
 * ```ts
 * const draft = createRequestDraft(state.requests)
 * for (const event of batch) applyEvent(draft, event)
 * ```
 */
export function applyEvent(draft: RequestDraft, event: EventPayload): void {
  const requestId = str(event.requestId)
  switch (event.type) {
    case "request:start":
      draft.add(requestFromStart(event))
      return
    case "stream:open":
      if (draft.has(requestId)) draft.update(requestId, (r) => withStreamOpen(r, event))
      else draft.add(streamFromOpen(event))
      return
    case "validation:fail": {
      const issues = validationIssuesOf(event.issues)
      if (issues) draft.update(requestId, (r) => withValidationFail(r, issues))
      return
    }
  }
  const change = ENTRY_CHANGES.get(event.type)
  if (change) draft.update(requestId, (r) => change(r, event))
}

type EntryChange = (r: RequestEntry, event: EventPayload) => RequestEntry

/** What each event that updates a known request does to it. */
const ENTRY_CHANGES: ReadonlyMap<string, EntryChange> = new Map<string, EntryChange>([
  ["request:end", withRequestEnd],
  ["request:error", withRequestError],
  ["middleware:enter", withMiddlewareEnter],
  ["middleware:exit", withMiddlewareExit],
  ["middleware:error", withMiddlewareError],
  ["http:fetch:start", withFetchStart],
  ["proxy:client-timing", withProxyClientTiming],
  ["stream:message", withStreamMessage],
  ["stream:close", withStreamClose],
  ["stream:error", withStreamError],
])
