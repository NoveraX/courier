import type { BackoffConfig } from "../types";

/** Options for subscribeSSE */
export interface SubscribeSSEOptions {
  /** Custom headers (e.g. Authorization) — why we use fetch, not EventSource */
  headers?: Record<string, string> | undefined;
  /** Initial resume point for reconnection */
  lastEventId?: string | undefined;
  /** Reconnection backoff configuration */
  backoff?: BackoffConfig | undefined;
  /** Inactivity timeout — reconnect if no data/comments for this long (default 45000ms) */
  heartbeatTimeout?: number | undefined;
  /**
   * Reconnection attempts in a row that deliver nothing before giving up
   * (default Infinity). A connection that delivers anything starts the count over.
   */
  maxAttempts?: number | undefined;
  /** External cancellation signal */
  signal?: AbortSignal | undefined;
  /** Custom data parser (default JSON.parse) */
  parse?: ((raw: string) => unknown) | undefined;
  /** Max client-side event buffer size (default 1000). Oldest events dropped on overflow. */
  maxBufferSize?: number | undefined;
  /**
   * Fires once each time the SSE fetch resolves with a successful response,
   * before any events are read from the body. Used by the studio
   * instrumentation layer to capture response headers in direct mode.
   */
  onResponse?: ((response: Response) => void) | undefined;
}
