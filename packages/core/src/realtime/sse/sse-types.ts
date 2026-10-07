import type { BackoffConfig } from "../types";

/** What one connection of a stream is opened with, besides the stream's own headers. */
export interface SSEConnectInit {
  /** Headers the stream's own `headers` override — the user's session's */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** What `fetch` is given besides the headers and the signal — `credentials` */
  readonly init?: Readonly<RequestInit> | undefined;
}

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
  /**
   * Asked before every connection — the first and each reconnect — for what
   * it is opened with besides `headers`: the headers of the user's session,
   * as they are now, and what `fetch` is given. A rejection is a failed
   * connection, retried as a dropped one is.
   */
  beforeConnect?: (() => SSEConnectInit | Promise<SSEConnectInit>) | undefined;
}
