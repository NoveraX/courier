import { generateRequestId, studioHooks } from "../../studio";

const PREVIEW_MAX = 512;

/** Stream metadata captured at the start of an SSE/WS lifecycle */
export interface StreamMeta {
  source: string;
  group: string | undefined;
  method: string;
  transport: "sse" | "ws";
  mode: "direct" | "proxy";
  requestHeaders?: Record<string, string>;
}

/** Handle returned by `beginStream` for emitting lifecycle events */
export interface StreamInstrumentation {
  requestId: string;
  startTime: number;
  /**
   * Emit stream:message for an event. `eventType` defaults to `"data"`
   * (server→client), matching the convention used by the WS adapter and
   * the server SSE stream. Pass an explicit value to preserve a user-set
   * SSE `event:` field.
   */
  emitMessage(data: unknown, eventType?: string): void;
  /**
   * Re-emit stream:open with updated metadata. Used when async data
   * (e.g. fetch response headers) becomes available after the initial
   * open. The store handler merges into the existing entry by requestId.
   */
  updateMeta(patch: { responseHeaders?: Record<string, string> }): void;
  /** Emit stream:close exactly once (idempotent across all paths) */
  emitClose(reason: "complete" | "error" | "disconnect"): void;
  /** Emit stream:error then close with reason "error" */
  emitError(error: unknown): void;
}

/**
 * Begin a studio-tracked stream lifecycle. Returns null when studio hooks
 * are not installed (zero-cost path), or an instrumentation handle that
 * the caller uses to emit message/close/error events.
 *
 * @param meta - Stream metadata (source/group/method/transport/mode).
 * @param externalRequestId - Optional caller-supplied requestId. When the
 *   caller already has a tracking ID it needs to correlate with (e.g. the
 *   Studio Playground returning the requestId to the UI before the stream
 *   starts), pass it here so all subsequent stream:* events use the same id
 *   instead of an auto-generated one. Falls back to `generateRequestId()`.
 */
export function beginStream(
  meta: StreamMeta,
  externalRequestId?: string,
): StreamInstrumentation | null {
  if (!studioHooks.onStreamOpen) return null;

  const requestId = externalRequestId ?? generateRequestId();
  const startTime = Date.now();
  let seq = 0;
  let totalBytes = 0;
  let closed = false;

  studioHooks.onStreamOpen({
    requestId,
    source: meta.source,
    group: meta.group,
    method: meta.method,
    transport: meta.transport,
    mode: meta.mode,
    timestamp: startTime,
    ...(meta.requestHeaders && { requestHeaders: meta.requestHeaders }),
  });

  return {
    requestId,
    startTime,
    emitMessage(data, eventType = "data") {
      if (closed) return;
      const json = safeStringify(data);
      const dataSize = byteLength(json);
      totalBytes += dataSize;
      studioHooks.onStreamMessage?.({
        requestId,
        seq: ++seq,
        eventType,
        dataSize,
        dataPreview: truncatePreview(json, PREVIEW_MAX),
        timestamp: Date.now(),
      });
    },
    updateMeta(patch) {
      if (closed) return;
      // Re-emit stream:open with the same requestId so the store handler
      // merges the new metadata into the existing entry.
      studioHooks.onStreamOpen?.({
        requestId,
        source: meta.source,
        group: meta.group,
        method: meta.method,
        transport: meta.transport,
        mode: meta.mode,
        timestamp: startTime,
        ...(meta.requestHeaders && { requestHeaders: meta.requestHeaders }),
        ...(patch.responseHeaders && { responseHeaders: patch.responseHeaders }),
      });
    },
    emitClose(reason) {
      if (closed) return;
      closed = true;
      studioHooks.onStreamClose?.({
        requestId,
        reason,
        eventCount: seq,
        totalBytes,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });
    },
    emitError(error) {
      if (closed) return;
      const message = error instanceof Error ? error.message : String(error);
      studioHooks.onStreamError?.({ requestId, error: message, timestamp: Date.now() });
      closed = true;
      studioHooks.onStreamClose?.({
        requestId,
        reason: "error",
        eventCount: seq,
        totalBytes,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });
    },
  };
}

/**
 * Stringify arbitrary data safely. Handles BigInt, circular references,
 * and Symbols which would otherwise throw or be silently dropped by
 * native JSON.stringify.
 */
export function safeStringify(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, replacer);
  } catch {
    return String(data);
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  return value;
}

/** Byte length of a string in UTF-8 encoding (not char count) */
function byteLength(str: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  // Fallback for environments without TextEncoder
  return Buffer.byteLength(str, "utf8");
}

/**
 * Truncate a string preview at a UTF-8-safe byte boundary.
 * Avoids splitting multi-byte characters (e.g. emojis) which would
 * produce invalid UTF-8 sequences and break studio JSON parsing.
 */
function truncatePreview(str: string, maxBytes: number): string {
  if (byteLength(str) <= maxBytes) return str;
  // Walk back from maxBytes until we find a valid char boundary
  let end = Math.min(str.length, maxBytes);
  while (end > 0 && byteLength(str.slice(0, end)) > maxBytes) {
    end--;
  }
  return `${str.slice(0, end)}…`;
}
