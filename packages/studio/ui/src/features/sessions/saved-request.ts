import { isRecord, optNum, optStr, str } from "@/store/event-helpers";
import { httpVersionOf } from "@/store/http-version";
import type { RequestEntry, RequestStatus, RequestTiming } from "@/store/types";

const STATUSES: ReadonlySet<string> = new Set<RequestStatus>([
  "pending",
  "success",
  "error",
  "aborted",
  "validation_error",
]);

/**
 * What a saved session keeps of a request: what the Timeline shows of it,
 * without its stream events and middleware entries, which Studio does not
 * store.
 *
 * @param r - A request on screen
 * @returns The request as Studio's `/api/sessions/save` takes it
 *
 * @example
 * ```ts
 * await post("/api/sessions/save", { name, requests: requests.map(savedRequestOf) })
 * ```
 */
export function savedRequestOf(r: RequestEntry): Record<string, unknown> {
  return {
    id: r.id,
    source: r.source,
    group: r.group,
    method: r.method,
    httpMethod: r.httpMethod,
    variables: r.variables,
    variablesCutFrom: r.variablesCutFrom,
    mode: r.mode,
    type: r.type,
    status: r.status,
    statusCode: r.statusCode,
    timing: r.timing,
    size: r.size,
    data: r.data,
    dataCutFrom: r.dataCutFrom,
    requestHeaders: r.requestHeaders,
    headers: r.headers,
    error: r.error,
    startedAt: r.startedAt,
    url: r.url,
    httpVersion: r.httpVersion,
    sessionId: r.sessionId,
    callerRuntimeId: r.callerRuntimeId,
  };
}

/**
 * Read back a request of a saved session, as Studio's `/api/sessions/load`
 * answers it.
 *
 * @param raw - One of the session's `requests`
 * @returns The request to show, or `undefined` for one without an id, a
 *   name or a start time
 *
 * @example
 * ```ts
 * const requests = session.requests.map(requestFromSaved).filter((r) => r !== undefined)
 * ```
 */
export function requestFromSaved(raw: unknown): RequestEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, source, method, startedAt } = raw;
  if (typeof id !== "string" || typeof source !== "string" || typeof method !== "string")
    return undefined;
  if (typeof startedAt !== "number") return undefined;
  return {
    id,
    source,
    method,
    startedAt,
    group: optStr(raw.group),
    httpMethod: optStr(raw.httpMethod),
    variables: raw.variables,
    variablesCutFrom: optNum(raw.variablesCutFrom),
    mode: raw.mode === "proxy" ? "proxy" : "direct",
    type: raw.type === "query" || raw.type === "mutation" ? raw.type : undefined,
    status: isStatus(raw.status) ? raw.status : "success",
    statusCode: optNum(raw.statusCode),
    timing: timingOf(raw.timing),
    size: optNum(raw.size),
    data: raw.data,
    dataCutFrom: optNum(raw.dataCutFrom),
    requestHeaders: headersOf(raw.requestHeaders),
    headers: headersOf(raw.responseHeaders),
    error: errorOf(raw.error),
    url: optStr(raw.url),
    httpVersion: httpVersionOf(raw.httpVersion),
    sessionId: str(raw.sessionId),
    callerRuntimeId: optStr(raw.callerRuntimeId),
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
  };
}

function isStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && STATUSES.has(value);
}

function timingOf(raw: unknown): RequestTiming | undefined {
  if (!isRecord(raw)) return undefined;
  const { total, middleware, fetch, validation } = raw;
  if (typeof total !== "number") return undefined;
  return {
    total,
    middleware: optNum(middleware) ?? 0,
    fetch: optNum(fetch) ?? 0,
    validation: optNum(validation) ?? 0,
  };
}

function headersOf(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw))
    if (typeof value === "string") headers[name] = value;
  return headers;
}

function errorOf(raw: unknown): RequestEntry["error"] {
  if (!isRecord(raw) || typeof raw.message !== "string") return undefined;
  return { type: str(raw.type, "Error"), message: raw.message, status: optNum(raw.status) };
}
