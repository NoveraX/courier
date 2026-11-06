import { serverCapability } from "../../capabilities/registry";
import type { StreamStatusEvent } from "../../studio/hooks-stream";
import { byteLength, safeStringify, truncatePreview } from "./message-preview";
import { streamStatusEvent } from "./stream-status";
import type { Reconnect } from "./watch-connection";

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

/**
 * Handle returned by `beginStream` for emitting lifecycle events: of one
 * Studio entry at a time, a new one for each time the stream opens again.
 */
export interface StreamInstrumentation {
  /** The id of the entry now told of */
  readonly requestId: string;
  readonly startTime: number;
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
  /**
   * Tell Studio what a connection of the stream sent — the session's headers
   * read as it opened — and what its answer carried.
   */
  updateMeta(patch: {
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
  }): void;
  /** Emit stream:close exactly once (idempotent across all paths) */
  emitClose(reason: "complete" | "error" | "disconnect"): void;
  /** Emit stream:error then close with reason "error" */
  emitError(error: unknown): void;
  /**
   * Tell how the stream's connection stands — with why the last one ended,
   * on `reconnecting`. Nothing more once the stream has closed.
   */
  emitStatus(status: StreamStatusEvent["status"], reconnect?: Reconnect): void;
  /**
   * Begin a new entry for the stream, once its last has closed: the server
   * ended it, and it was opened again. The new entry has an id of its own
   * and the request headers last sent; everything told after goes to it.
   */
  reopen(): void;
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
 *   instead of an auto-generated one. Falls back to a new id from Studio.
 */
export function beginStream(
  meta: StreamMeta,
  externalRequestId?: string,
): StreamInstrumentation | null {
  const studio = serverCapability("studio");
  const hooks = studio?.hooks;
  if (studio === undefined || hooks?.onStreamOpen === undefined) return null;

  let requestId = externalRequestId ?? studio.requestId();
  let startTime = Date.now();
  let seq = 0;
  let totalBytes = 0;
  let closed = false;
  let requestHeaders = meta.requestHeaders;
  let responseHeaders: Record<string, string> | undefined;

  /* stream:open with the entry's id: again with the same id, the store merges what is new into it. */
  const announce = (): void =>
    hooks.onStreamOpen?.({
      requestId,
      source: meta.source,
      group: meta.group,
      method: meta.method,
      transport: meta.transport,
      mode: meta.mode,
      timestamp: startTime,
      ...(requestHeaders && { requestHeaders }),
      ...(responseHeaders && { responseHeaders }),
    });

  announce();

  return {
    get requestId() {
      return requestId;
    },
    get startTime() {
      return startTime;
    },
    emitMessage(data, eventType = "data") {
      if (closed) return;
      const json = safeStringify(data);
      const dataSize = byteLength(json);
      totalBytes += dataSize;
      hooks.onStreamMessage?.({
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
      requestHeaders = patch.requestHeaders ?? requestHeaders;
      responseHeaders = patch.responseHeaders ?? responseHeaders;
      announce();
    },
    reopen() {
      if (!closed) return;
      requestId = studio.requestId();
      startTime = Date.now();
      seq = 0;
      totalBytes = 0;
      closed = false;
      /* What the last connection answered is not this one's. */
      responseHeaders = undefined;
      announce();
    },
    emitClose(reason) {
      if (closed) return;
      closed = true;
      hooks.onStreamClose?.({
        requestId,
        reason,
        eventCount: seq,
        totalBytes,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });
    },
    emitStatus(status, reconnect) {
      if (closed) return;
      hooks.onStreamStatus?.(streamStatusEvent(requestId, status, reconnect));
    },
    emitError(error) {
      if (closed) return;
      const message = error instanceof Error ? error.message : String(error);
      hooks.onStreamError?.({ requestId, error: message, timestamp: Date.now() });
      closed = true;
      hooks.onStreamClose?.({
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
