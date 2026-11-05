import type { PlatformFetch } from "../../http-client/source-transport";
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
  /**
   * Reconnection backoff: each wait drawn at random up to its ceiling, which
   * starts over once a connection stayed open 10 s. A server that asks for a
   * wait — the stream's `retry:`, `Retry-After` on a 429 or 503 — is not
   * called back sooner.
   */
  backoff?: BackoffConfig | undefined;
  /** Inactivity timeout — reconnect if no data/comments for this long (default 45000ms) */
  heartbeatTimeout?: number | undefined;
  /**
   * Reconnection attempts in a row that deliver nothing before giving up
   * (default Infinity). A connection that delivers anything starts the count over.
   */
  maxAttempts?: number | undefined;
  /**
   * Whether the page's signals act on the stream — the network back, the
   * page shown again or back from the back/forward cache, its window
   * focused: one waiting to reconnect does so at once, and one open that
   * has heard nothing from its server for longer than `heartbeatTimeout`,
   * as after the computer slept, is opened again. `true` unless set to `false`.
   */
  reconnectOnResume?: boolean | undefined;
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
   * connection, retried as a dropped one is. A stream the server refuses
   * with 401 is opened once more when what this gives has changed since —
   * a token renewed meanwhile; the same again ends it with an `AuthError`.
   */
  beforeConnect?: (() => SSEConnectInit | Promise<SSEConnectInit>) | undefined;
  /** Sends each connection's request in place of the platform's `fetch`: the source's own. */
  fetch?: PlatformFetch | undefined;
}
