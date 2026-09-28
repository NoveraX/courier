import type { StudioEvent, RequestEntry, ValidationIssue } from "./types"
import { str, optStr } from "./event-helpers"
import { handleMiddlewareEnter, handleMiddlewareExit, handleMiddlewareError } from "./handle-middleware-events"
import { handleRequestStart, handleRequestEnd, handleRequestError, handleProxyClientTiming } from "./handle-request-events"
import { handleStreamOpen, handleStreamMessage, handleStreamClose, handleStreamError } from "./handle-stream-events"

type EventPayload = StudioEvent & Record<string, unknown>

interface ReducerResult {
  requests: RequestEntry[]
  /** How many of the oldest requests this event pushed past the cap. */
  droppedCount: number
}

/**
 * Fold one runtime event into the request list.
 *
 * @param state - The current request list
 * @param event - The runtime event
 * @param maxRequests - How many requests the list keeps
 * @returns The next request list, and how many old requests it dropped
 */
export function handleEventReducer(
  state: { requests: RequestEntry[] },
  event: EventPayload,
  maxRequests: number = 2000,
): ReducerResult {
  const { requests, droppedCount = 0 } = reduceRequests(state, event, maxRequests)
  return { requests, droppedCount }
}

function reduceRequests(
  state: { requests: RequestEntry[] },
  event: EventPayload,
  maxRequests: number,
): { requests: RequestEntry[]; droppedCount?: number } {
  if (!event || typeof event.type !== "string") return state

  switch (event.type) {
    case "request:start":
      return handleRequestStart(state, event, maxRequests)
    case "request:end":
      return handleRequestEnd(state, event)
    case "request:error":
      return handleRequestError(state, event)

    case "middleware:enter":
      return handleMiddlewareEnter(state, event)
    case "middleware:exit":
      return handleMiddlewareExit(state, event)
    case "middleware:error":
      return handleMiddlewareError(state, event)

    case "http:fetch:start": {
      const requestId = str(event.requestId)
      return {
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                url: optStr(event.url) ?? r.url,
                httpMethod: optStr(event.method) ?? r.httpMethod,
              }
            : r
        ),
      }
    }

    case "validation:fail": {
      const requestId = str(event.requestId)
      const issues = event.issues as ValidationIssue[] | undefined
      if (!issues) return state
      return {
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                error: {
                  type: "ValidationError",
                  message: `Validation failed: ${issues.length} issue(s)`,
                  validationIssues: issues,
                },
              }
            : r
        ),
      }
    }

    case "proxy:client-timing":
      return handleProxyClientTiming(state, event)

    case "stream:open":
      return handleStreamOpen(state, event, maxRequests)
    case "stream:message":
      return handleStreamMessage(state, event)
    case "stream:close":
      return handleStreamClose(state, event)
    case "stream:error":
      return handleStreamError(state, event)

    case "http:fetch:end":
    case "validation:start":
    case "validation:pass":
    case "proxy:receive":
    case "proxy:respond":
    case "cache:hit":
    case "cache:miss":
    case "cache:store":
    case "cache:invalidate":
    case "dedup:abort":
    case "dedup:reuse":
    case "upload:progress":
    case "upload:complete":
      return state

    default:
      return state
  }
}
