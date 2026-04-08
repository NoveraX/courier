import type { RequestEntry, StreamEventRecord } from "./types"
import { str, num, optStr } from "./event-helpers"

type EventPayload = Record<string, unknown>
type State = { requests: RequestEntry[] }

const MAX_STREAM_EVENTS = 200

/** Append to array with cap — avoids spread+slice on every call */
function appendCapped<T>(prev: T[] | undefined, item: T, max: number): T[] {
  if (!prev || prev.length === 0) return [item];
  if (prev.length < max) return [...prev, item];
  // Drop oldest: reuse tail slice + append (one allocation, not two)
  const next = prev.slice(1);
  next.push(item);
  return next;
}

/** Create or merge a RequestEntry for an SSE/WS stream opening.
 *
 * When the same `requestId` is already known, this is a metadata update
 * (e.g. response headers becoming available after the initial fetch
 * resolves) — merge into the existing entry instead of creating a duplicate.
 */
export function handleStreamOpen(
  state: State,
  event: EventPayload,
  maxRequests: number,
): { requests: RequestEntry[]; droppedCount: number } {
  const transport = event.transport === "ws" ? "ws" as const : "sse" as const;
  const id = str(event.requestId)

  const rawRequestHeaders = event.requestHeaders as Record<string, string> | undefined;
  const rawResponseHeaders = event.responseHeaders as Record<string, string> | undefined;
  // Drop empty header bags so the UI can fall back to "no headers" state
  // instead of rendering an empty container.
  const requestHeaders =
    rawRequestHeaders && Object.keys(rawRequestHeaders).length > 0 ? rawRequestHeaders : undefined;
  const responseHeaders =
    rawResponseHeaders && Object.keys(rawResponseHeaders).length > 0
      ? rawResponseHeaders
      : undefined;

  const existingIndex = state.requests.findIndex((r) => r.id === id)
  if (existingIndex !== -1) {
    const updated = [...state.requests]
    const existing = updated[existingIndex]!
    updated[existingIndex] = {
      ...existing,
      ...(requestHeaders && { requestHeaders }),
      ...(responseHeaders && { headers: responseHeaders }),
    }
    return { requests: updated, droppedCount: 0 }
  }

  const entry: RequestEntry = {
    id,
    source: str(event.source),
    group: optStr(event.group),
    method: str(event.method),
    variables: undefined,
    mode: event.mode === "proxy" ? "proxy" : "direct",
    status: "pending",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: num(event.timestamp, Date.now()),
    sessionId: str(event.sessionId),
    transport,
    streamStatus: "streaming",
    streamEventCount: 0,
    streamTotalBytes: 0,
    ...(requestHeaders && { requestHeaders }),
    ...(responseHeaders && { headers: responseHeaders }),
  }

  const updated = [entry, ...state.requests]
  const overflow = updated.length > maxRequests
  return {
    requests: overflow ? updated.slice(0, maxRequests) : updated,
    droppedCount: overflow ? updated.length - maxRequests : 0,
  }
}

/** Increment event count and total bytes, store event record */
export function handleStreamMessage(
  state: State,
  event: EventPayload,
): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const dataSize = num(event.dataSize)
  const seq = num(event.seq)
  const eventType = optStr(event.eventType)
  const dataPreview = optStr(event.dataPreview)
  const timestamp = num(event.timestamp, Date.now())

  return {
    requests: state.requests.map((r) => {
      if (r.id !== requestId) return r

      const newCount = (r.streamEventCount ?? 0) + 1
      const record: StreamEventRecord = { seq, dataSize, timestamp, ...(eventType && { eventType }), ...(dataPreview && { dataPreview }) }
      const events = appendCapped(r.streamEvents, record, MAX_STREAM_EVENTS)

      return {
        ...r,
        streamEventCount: newCount,
        streamTotalBytes: (r.streamTotalBytes ?? 0) + dataSize,
        streamEvents: events,
      }
    }),
  }
}

/** Finalize a stream — mark as complete with duration */
export function handleStreamClose(
  state: State,
  event: EventPayload,
): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const reason = str(event.reason, "complete")

  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: reason === "error" ? "error" as const : "success" as const,
            streamStatus: reason === "error" ? "error" as const : "complete" as const,
            streamEventCount: Math.max(num(event.eventCount), r.streamEventCount ?? 0),
            streamTotalBytes: Math.max(num(event.totalBytes), r.streamTotalBytes ?? 0),
            streamDuration: num(event.duration),
          }
        : r
    ),
  }
}

/** Mark a stream as errored */
export function handleStreamError(
  state: State,
  event: EventPayload,
): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)

  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: "error" as const,
            streamStatus: "error" as const,
            error: {
              type: "StreamError",
              message: str(event.error, "Stream error"),
            },
          }
        : r
    ),
  }
}
