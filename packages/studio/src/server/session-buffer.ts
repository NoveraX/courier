/**
 * In-memory event buffer — collects raw events from apps for session saving.
 *
 * The UI stores its own parsed representation; this buffer keeps the raw
 * events so the server can independently build a SavedSession on demand
 * (e.g., auto-save on last app disconnect).
 */

const MAX_EVENTS = 5000;

const REQUEST_EVENTS_KEY = Symbol.for("courier.studio.session-request-events");
const ACTIVE_SESSIONS_KEY = Symbol.for("courier.studio.session-active-sessions");

const g = globalThis as Record<symbol, unknown>;

if (!g[REQUEST_EVENTS_KEY]) g[REQUEST_EVENTS_KEY] = new Map<string, Record<string, unknown>>();
if (!g[ACTIVE_SESSIONS_KEY]) g[ACTIVE_SESSIONS_KEY] = new Set<string>();

/** Raw events received from app namespace, keyed by request ID */
const requestEvents = g[REQUEST_EVENTS_KEY] as Map<string, Record<string, unknown>>;

/** Track which sessions contributed events */
const activeSessions = g[ACTIVE_SESSIONS_KEY] as Set<string>;

/** Process an incoming event from an app */
export function bufferEvent(event: Record<string, unknown>): void {
  const type = event["type"] as string | undefined;
  if (!type) return;

  const sessionId = event["sessionId"] as string | undefined;
  if (sessionId) activeSessions.add(sessionId);

  if (type === "request:start") {
    const id = event["id"] as string;
    if (!id) return;

    // Cap buffer size
    if (requestEvents.size >= MAX_EVENTS) {
      const oldest = requestEvents.keys().next().value;
      if (oldest) requestEvents.delete(oldest);
    }

    requestEvents.set(id, {
      id,
      source: event["source"],
      group: event["group"],
      method: event["method"],
      httpMethod: event["httpMethod"],
      variables: event["variables"],
      mode: event["mode"],
      type: event["endpointType"],
      status: "pending",
      middlewareCount: event["middlewareCount"],
      hasValidation: event["hasValidation"],
      startedAt: event["timestamp"] ?? Date.now(),
      sessionId: event["sessionId"],
    });
    return;
  }

  if (type === "request:end") {
    const reqId = event["requestId"] as string;
    const entry = requestEvents.get(reqId);
    if (!entry) return;

    entry["status"] = "success";
    entry["statusCode"] = event["status"];
    entry["data"] = event["data"];
    entry["headers"] = event["headers"];
    entry["timing"] = event["timing"];
    entry["size"] = (event["size"] as Record<string, number> | undefined)?.["response"];
    entry["url"] = event["url"];
    return;
  }

  if (type === "request:error") {
    const reqId = event["requestId"] as string;
    const entry = requestEvents.get(reqId);
    if (!entry) return;

    const errorType = (event["error"] as string) ?? "unknown";
    entry["status"] = errorType === "ValidationError" ? "validation_error" : "error";
    entry["statusCode"] = event["status"];
    entry["error"] = {
      type: errorType,
      status: event["status"],
      message: event["message"],
    };
    return;
  }

  if (type === "http:fetch:start") {
    const reqId = event["requestId"] as string;
    const entry = requestEvents.get(reqId);
    if (entry) {
      entry["url"] = event["url"];
      entry["httpMethod"] = event["method"];
      entry["requestHeaders"] = event["headers"];
    }
  }
}

/** Get all buffered requests as an array */
export function getBufferedRequests(): Record<string, unknown>[] {
  return Array.from(requestEvents.values());
}

/** Check if buffer has any data worth saving */
export function hasBufferedData(): boolean {
  return requestEvents.size > 0;
}

/** Clear the buffer */
export function clearBuffer(): void {
  requestEvents.clear();
  activeSessions.clear();
}

/** Get active session IDs that contributed events */
export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions);
}
