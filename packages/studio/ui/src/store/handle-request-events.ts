import type {
  ProxyTiming,
  RequestEntry,
  RequestStatus,
  RequestTiming,
  ValidationIssue,
} from "./types"
import { str, num, optStr, optNum } from "./event-helpers"

type EventPayload = Record<string, unknown>
type State = { requests: RequestEntry[] }

export function handleRequestStart(state: State, event: EventPayload, maxRequests: number): { requests: RequestEntry[]; droppedCount: number } {
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
  const overflow = updated.length > maxRequests
  return {
    requests: overflow ? updated.slice(0, maxRequests) : updated,
    droppedCount: overflow ? updated.length - maxRequests : 0,
  }
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
            proxyTiming: mergeProxyTiming(event.proxyTiming as ProxyTiming | undefined, r.proxyTiming),
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

/**
 * A request that failed keeps what its caller received — the proxy's own
 * status where the upstream gave none — the upstream's headers and error
 * body, and how long it ran. Issues a `validation:fail` recorded stay with it.
 */
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
  const errorStatus = failureStatus(errorData?.type)
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: errorStatus,
            error: errorData && {
              ...errorData,
              validationIssues: errorData.validationIssues ?? r.error?.validationIssues,
            },
            statusCode: optNum(event.status) ?? errorData?.status ?? r.statusCode,
            timing: (event.timing as RequestTiming | undefined) ?? r.timing,
            headers: (event.headers as Record<string, string> | undefined) ?? r.headers,
            data: event.data !== undefined ? event.data : r.data,
          }
        : r
    ),
  }
}

/* The runtime names failures in lower case; the older capitalised names stay understood. */
function failureStatus(type: string | undefined): RequestStatus {
  if (type === "validation" || type === "ValidationError") return "validation_error"
  if (type === "aborted" || type === "AbortError") return "aborted"
  return "error"
}

export function handleProxyClientTiming(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const networkLatency = num(event.networkLatency)
  const download = num(event.download)
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            proxyTiming: {
              clientToProxy: networkLatency,
              proxyToBackend: r.proxyTiming?.proxyToBackend ?? 0,
              backendToProxy: r.proxyTiming?.backendToProxy ?? 0,
              proxyToClient: download,
            },
          }
        : r
    ),
  }
}

/** Merge server-side proxyTiming with already-received browser-side values */
function mergeProxyTiming(
  server: ProxyTiming | undefined,
  existing: ProxyTiming | undefined,
): ProxyTiming | undefined {
  if (!server) return existing
  return {
    ...server,
    clientToProxy: server.clientToProxy || existing?.clientToProxy || 0,
    proxyToClient: server.proxyToClient || existing?.proxyToClient || 0,
  }
}
