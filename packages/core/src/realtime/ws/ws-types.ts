import type { RealtimeError } from "../errors";
import type { BackoffConfig, ConnectionStatus } from "../types";
import type { HeartbeatConfig } from "./heartbeat";
import type { MessageQueueConfig } from "./message-queue";

// ---------------------------------------------------------------------------
// Client-side WebSocket interface (browser-compatible)
// ---------------------------------------------------------------------------

/** Minimal client-side WebSocket — compatible with browser, Deno, Bun */
export interface WSClientSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

/** Factory to create a WebSocket instance (allows DI for testing) */
export type WSSocketFactory = (url: string, protocols?: string[]) => WSClientSocket;

// ---------------------------------------------------------------------------
// Connection config
// ---------------------------------------------------------------------------

export interface WSConnectionConfig {
  /** WebSocket endpoint URL */
  url: string;
  /** Sub-protocols for the WS handshake */
  protocols?: string[];
  /** Heartbeat (ping/pong) configuration */
  heartbeat?: HeartbeatConfig;
  /** Reconnection backoff configuration */
  backoff?: BackoffConfig;
  /** Outbound message queue configuration */
  messageQueue?: MessageQueueConfig;
  /** Called to get a fresh auth token before connect/reconnect */
  getAuthToken?: () => string | Promise<string>;
  /** Status change listener */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Max bufferedAmount before dropping sends (default 1MB) */
  maxBufferedAmount?: number;
  /**
   * Largest message sent, as the length of its encoded frame — the server's
   * `maxMessageSize` (default 64 KB). A larger one is not sent: its topic
   * hears a 4413 error, and the connection goes on.
   */
  maxMessageSize?: number;
  /** Request-response timeout in ms (default 30000) */
  requestTimeout?: number;
  /** WebSocket factory — override for testing */
  socketFactory?: WSSocketFactory;
}

// ---------------------------------------------------------------------------
// Topic handler
// ---------------------------------------------------------------------------

/** Callback for incoming messages on a topic */
export type TopicHandler = (payload: unknown) => void;

/** Receives everything the server says about one topic */
export interface TopicSubscriber {
  /** A payload the server sent on the topic */
  data(payload: unknown): void;
  /** A message on the topic was refused, or its handler failed; the subscription goes on */
  error?(error: RealtimeError): void;
  /**
   * The subscription ended — the server finished or refused it, or the
   * connection closed for good. `error` says why when it failed.
   */
  end?(error: RealtimeError | undefined): void;
}

// ---------------------------------------------------------------------------
// Connection API
// ---------------------------------------------------------------------------

export interface WSConnection {
  /**
   * Subscribe to a topic. Returns unsubscribe function. A bare function
   * receives the payloads only; a `TopicSubscriber` also hears of errors on
   * the topic and of its end.
   */
  subscribe(
    topic: string,
    subscriber: TopicHandler | TopicSubscriber,
    variables?: unknown,
  ): () => void;
  /**
   * Send a message to a topic. Held until the server confirms the topic's
   * subscription, when there is one, and queued while reconnecting.
   */
  send(topic: string, payload: unknown): void;
  /** Request-response over WS with correlation ID and timeout. */
  request<TResult = unknown>(topic: string, payload: unknown): Promise<TResult>;
  /** Send a new auth token to the server without reconnecting. */
  refreshToken(token: string): void;
  /** Close the connection gracefully. */
  close(): void;
  /** Current connection status. */
  readonly status: ConnectionStatus;
  /** Subscribe to status changes. Returns unsubscribe. */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
}
