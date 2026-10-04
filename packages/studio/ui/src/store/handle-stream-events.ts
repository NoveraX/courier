import { num, optStr, str } from "./event-helpers";
import { readStringRecord } from "./payload";
import type { RequestEntry, StreamEventRecord } from "./types";

type EventPayload = Record<string, unknown>;

const MAX_STREAM_EVENTS = 200;

/** Append to array with cap — avoids spread+slice on every call */
function appendCapped<T>(prev: T[] | undefined, item: T, max: number): T[] {
  if (!prev || prev.length === 0) return [item];
  if (prev.length < max) return [...prev, item];
  // Drop oldest: reuse tail slice + append (one allocation, not two)
  const next = prev.slice(1);
  next.push(item);
  return next;
}

/** Header bags a stream opening carries; an empty bag is left out so the UI shows "no headers". */
function openingHeaders(event: EventPayload): Pick<RequestEntry, "requestHeaders" | "headers"> {
  const requestHeaders = nonEmpty(readStringRecord(event.requestHeaders));
  const headers = nonEmpty(readStringRecord(event.responseHeaders));
  return { ...(requestHeaders && { requestHeaders }), ...(headers && { headers }) };
}

function nonEmpty(bag: Record<string, string> | undefined): Record<string, string> | undefined {
  return bag && Object.keys(bag).length > 0 ? bag : undefined;
}

/** A new RequestEntry for an SSE/WS stream opening. */
export function streamFromOpen(event: EventPayload): RequestEntry {
  return {
    id: str(event.requestId),
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
    transport: event.transport === "ws" ? "ws" : "sse",
    streamStatus: "streaming",
    streamEventCount: 0,
    streamTotalBytes: 0,
    ...openingHeaders(event),
  };
}

/**
 * A stream opening for a `requestId` already known is a metadata update
 * (e.g. response headers becoming available after the initial fetch
 * resolves): merge it into the existing entry instead of creating a duplicate.
 */
export function withStreamOpen(r: RequestEntry, event: EventPayload): RequestEntry {
  return { ...r, ...openingHeaders(event) };
}

/** Increment event count and total bytes, store event record */
export function withStreamMessage(r: RequestEntry, event: EventPayload): RequestEntry {
  const dataSize = num(event.dataSize);
  const eventType = optStr(event.eventType);
  const dataPreview = optStr(event.dataPreview);
  const record: StreamEventRecord = {
    seq: num(event.seq),
    dataSize,
    timestamp: num(event.timestamp, Date.now()),
    ...(eventType && { eventType }),
    ...(dataPreview && { dataPreview }),
  };
  return {
    ...r,
    streamEventCount: (r.streamEventCount ?? 0) + 1,
    streamTotalBytes: (r.streamTotalBytes ?? 0) + dataSize,
    streamEvents: appendCapped(r.streamEvents, record, MAX_STREAM_EVENTS),
  };
}

/** Finalize a stream — mark as complete with duration */
export function withStreamClose(r: RequestEntry, event: EventPayload): RequestEntry {
  const failed = str(event.reason, "complete") === "error";
  return {
    ...r,
    status: failed ? "error" : "success",
    streamStatus: failed ? "error" : "complete",
    streamEventCount: Math.max(num(event.eventCount), r.streamEventCount ?? 0),
    streamTotalBytes: Math.max(num(event.totalBytes), r.streamTotalBytes ?? 0),
    streamDuration: num(event.duration),
  };
}

/** Mark a stream as errored */
export function withStreamError(r: RequestEntry, event: EventPayload): RequestEntry {
  return {
    ...r,
    status: "error",
    streamStatus: "error",
    error: { type: "StreamError", message: str(event.error, "Stream error") },
  };
}
