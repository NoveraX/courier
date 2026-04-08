import type { BackoffConfig } from "../types";

/** Options for subscribeSSE */
export interface SubscribeSSEOptions {
  /** Custom headers (e.g. Authorization) — why we use fetch, not EventSource */
  headers?: Record<string, string>;
  /** Initial resume point for reconnection */
  lastEventId?: string;
  /** Reconnection backoff configuration */
  backoff?: BackoffConfig;
  /** Inactivity timeout — reconnect if no data/comments for this long (default 45000ms) */
  heartbeatTimeout?: number;
  /** Maximum reconnection attempts before giving up (default Infinity) */
  maxAttempts?: number;
  /** External cancellation signal */
  signal?: AbortSignal;
  /** Custom data parser (default JSON.parse) */
  parse?: (raw: string) => unknown;
  /** Max client-side event buffer size (default 1000). Oldest events dropped on overflow. */
  maxBufferSize?: number;
  /**
   * Fires once each time the SSE fetch resolves with a successful response,
   * before any events are read from the body. Used by the studio
   * instrumentation layer to capture response headers in direct mode.
   */
  onResponse?: (response: Response) => void;
}
