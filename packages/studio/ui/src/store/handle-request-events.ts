import { isPlainObject } from "@/socket/is-plain-object";
import { num, optNum, optStr, str } from "./event-helpers";
import {
  isValidationIssue,
  readList,
  readProxyTiming,
  readRequestTiming,
  readStringListRecord,
  readStringRecord,
} from "./payload";
import type { ProxyTiming, RequestEntry, RequestStatus, ValidationIssue } from "./types";

type EventPayload = Record<string, unknown>;

function readHasValidation(value: unknown): RequestEntry["hasValidation"] {
  if (!isPlainObject(value)) return { variables: false, response: false };
  return { variables: value.variables === true, response: value.response === true };
}

export function requestFromStart(event: EventPayload): RequestEntry {
  return {
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
    hasValidation: readHasValidation(event.hasValidation),
    startedAt: num(event.timestamp, Date.now()),
    url: optStr(event.url),
    sessionId: str(event.sessionId),
  };
}

export function withRequestEnd(r: RequestEntry, event: EventPayload): RequestEntry {
  return {
    ...r,
    status: "success" as const,
    statusCode: optNum(event.status),
    timing: readRequestTiming(event.timing),
    proxyTiming: mergeProxyTiming(readProxyTiming(event.proxyTiming), r.proxyTiming),
    size: optNum(event.size),
    data: event.data,
    rawResponse: optStr(event.rawResponse),
    validatedResponse: event.validatedResponse,
    validatedVariables: event.validatedVariables,
    sentBody: event.sentBody,
    requestHeaders: readStringRecord(event.requestHeaders),
    headers: readStringRecord(event.headers),
    middlewareHeaders: readStringListRecord(event.middlewareHeaders),
  };
}

/**
 * A request that failed keeps what its caller received — the proxy's own
 * status where the upstream gave none — the upstream's headers, error body
 * and its size, how long it ran and, for a proxied call, how that time split.
 * Issues a `validation:fail` recorded stay with it.
 */
export function withRequestError(r: RequestEntry, event: EventPayload): RequestEntry {
  const rawError = isPlainObject(event.error) ? event.error : undefined;
  const errorData = rawError
    ? {
        type: str(rawError.type, "Error"),
        status: optNum(rawError.status),
        message: str(rawError.message, "Unknown error"),
        validationIssues: readList(rawError.validationIssues, isValidationIssue),
      }
    : undefined;
  return {
    ...r,
    status: failureStatus(errorData?.type),
    error: errorData && {
      ...errorData,
      validationIssues: errorData.validationIssues ?? r.error?.validationIssues,
    },
    statusCode: optNum(event.status) ?? errorData?.status ?? r.statusCode,
    timing: readRequestTiming(event.timing) ?? r.timing,
    proxyTiming: mergeProxyTiming(readProxyTiming(event.proxyTiming), r.proxyTiming),
    size: optNum(event.size) ?? r.size,
    headers: readStringRecord(event.headers) ?? r.headers,
    data: event.data !== undefined ? event.data : r.data,
  };
}

function failureStatus(type: string | undefined): RequestStatus {
  if (type === "validation") return "validation_error";
  if (type === "aborted") return "aborted";
  return "error";
}

export function withProxyClientTiming(r: RequestEntry, event: EventPayload): RequestEntry {
  return {
    ...r,
    proxyTiming: {
      clientToProxy: num(event.networkLatency),
      proxyToBackend: r.proxyTiming?.proxyToBackend ?? 0,
      backendToProxy: r.proxyTiming?.backendToProxy ?? 0,
      proxyToClient: num(event.download),
    },
  };
}

export function withFetchStart(r: RequestEntry, event: EventPayload): RequestEntry {
  return {
    ...r,
    url: optStr(event.url) ?? r.url,
    httpMethod: optStr(event.method) ?? r.httpMethod,
  };
}

/** The issues a failed validation reported, kept until the request's own failure arrives. */
export function withValidationFail(r: RequestEntry, issues: ValidationIssue[]): RequestEntry {
  return {
    ...r,
    error: {
      type: "validation",
      message: `Validation failed: ${issues.length} issue(s)`,
      validationIssues: issues,
    },
  };
}

/** Merge server-side proxyTiming with already-received browser-side values */
function mergeProxyTiming(
  server: ProxyTiming | undefined,
  existing: ProxyTiming | undefined,
): ProxyTiming | undefined {
  if (!server) return existing;
  return {
    ...server,
    clientToProxy: server.clientToProxy || existing?.clientToProxy || 0,
    proxyToClient: server.proxyToClient || existing?.proxyToClient || 0,
  };
}
