import type { DevToolsEvent, RequestEntry, ValidationIssue } from "./types"
import { str, optStr } from "./event-helpers"
import { handleRequestStart, handleRequestEnd, handleRequestError, handleProxyClientTiming } from "./handle-request-events"
import { handleMiddlewareEnter, handleMiddlewareExit, handleMiddlewareError } from "./handle-middleware-events"

type EventPayload = DevToolsEvent & Record<string, unknown>

interface ReducerResult {
  requests: RequestEntry[]
  droppedCount?: number
}

export function handleEventReducer(
  state: { requests: RequestEntry[] },
  event: EventPayload,
  maxRequests: number = 2000,
): ReducerResult | typeof state {
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
