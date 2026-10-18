import type { RequestFailureCause } from "./request";
import type { StudioEvent } from "./types";

// ── Stream Events (SSE/WS) ───────────────────────────────────────────────────

export interface StreamOpenEvent extends StudioEvent {
  type: "stream:open";
  requestId: string;
  source: string;
  group: string | undefined;
  method: string;
  transport: "sse" | "ws";
  mode: "direct" | "proxy";
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface StreamMessageEvent extends StudioEvent {
  type: "stream:message";
  requestId: string;
  seq: number;
  eventType: string | undefined;
  dataSize: number;
  /** Truncated JSON preview (max 512 chars) */
  dataPreview?: string;
}

export interface StreamCloseEvent extends StudioEvent {
  type: "stream:close";
  requestId: string;
  reason: "complete" | "error" | "disconnect" | "shutdown" | "max_lifetime" | "slow_consumer";
  eventCount: number;
  totalBytes: number;
  duration: number;
}

export interface StreamErrorEvent extends StudioEvent {
  type: "stream:error";
  requestId: string;
  error: string;
}

/**
 * How the connection of a stream that opens one stands: being opened, open,
 * or being opened again after the last one ended. A stream that opens none,
 * as one served in process, sends none and stands open from `stream:open`
 * on — as every stream of a runtime older than this event does.
 */
export interface StreamStatusEvent extends StudioEvent {
  type: "stream:status";
  requestId: string;
  status: "connecting" | "open" | "reconnecting";
  /** On `reconnecting`: whether a connection of the stream has opened before */
  openedBefore?: boolean;
  /** On `reconnecting`: connections in a row that ended before they delivered anything */
  failures?: number;
  /** On `reconnecting`: why the last connection ended, as the platform said it */
  cause?: RequestFailureCause;
  /** On `reconnecting`: in how many ms the next connection opens */
  retryIn?: number;
}
