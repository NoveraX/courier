import type {
  RequestEntry,
  RequestStatus,
  RequestTiming,
  ValidationIssue,
} from "./types"
import { MAX_REQUESTS } from "./constants"
import { str, num, optStr, optNum } from "./event-helpers"

type EventPayload = Record<string, unknown>
type State = { requests: RequestEntry[] }

export function handleRequestStart(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const entry: RequestEntry = {
    id: str(event.id),
    source: str(event.source),
    group: optStr(event.group),
    method: str(event.method),
    httpMethod: optStr(event.httpMethod),
    variables: event.variables,
    mode: event.mode === "proxy" ? "proxy" : "direct",
    type:
      event.endpointType === "query" || event.endpointType === "mutation"
        ? event.endpointType
        : undefined,
    status: "pending",
    middlewareCount: num(event.middlewareCount),
    middlewareEntries: [],
    hasValidation:
      event.hasValidation &&
      typeof event.hasValidation === "object" &&
      "variables" in event.hasValidation &&
      "response" in event.hasValidation
        ? (event.hasValidation as { variables: boolean; response: boolean })
        : { variables: false, response: false },
    startedAt: num(event.timestamp, Date.now()),
    url: optStr(event.url),
    sessionId: str(event.sessionId),
  }
  const updated = [entry, ...state.requests]
  return { requests: updated.length > MAX_REQUESTS ? updated.slice(0, MAX_REQUESTS) : updated }
}

export function handleRequestEnd(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: "success" as const,
            statusCode: optNum(event.status),
            timing: event.timing as RequestTiming | undefined,
            proxyTiming: event.proxyTiming as RequestEntry["proxyTiming"],
            size: optNum(event.size),
            data: event.data,
            rawResponse: optStr(event.rawResponse),
            validatedResponse: event.validatedResponse,
            validatedVariables: event.validatedVariables,
            sentBody: event.sentBody,
            requestHeaders: event.requestHeaders as Record<string, string> | undefined,
            headers: event.headers as Record<string, string> | undefined,
            middlewareHeaders: event.middlewareHeaders as Record<string, string[]> | undefined,
          }
        : r
    ),
  }
}

export function handleRequestError(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const rawError = event.error as Record<string, unknown> | undefined
  const errorData = rawError
    ? {
        type: str(rawError.type, "Error"),
        status: optNum(rawError.status),
        message: str(rawError.message, "Unknown error"),
        validationIssues:
          (rawError.validationIssues as ValidationIssue[] | undefined) ?? undefined,
      }
    : undefined
  const errorStatus: RequestStatus =
    errorData?.type === "ValidationError"
      ? "validation_error"
      : errorData?.type === "AbortError"
        ? "aborted"
        : "error"
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: errorStatus,
            error: errorData,
            statusCode: errorData?.status ?? r.statusCode,
            timing: (event.timing as RequestTiming | undefined) ?? r.timing,
          }
        : r
    ),
  }
}
