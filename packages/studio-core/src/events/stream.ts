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
  /**
   * Set when `browsersOnly` let the call through only on the one-time pass
   * Studio's runtime gave the Playground's call: a page's call that says
   * nothing of where it comes from is still refused.
   */
  studioPass?: true;
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
