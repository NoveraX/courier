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

// ---------------------------------------------------------------------------
// Connection API
// ---------------------------------------------------------------------------

export interface WSConnection {
  /** Subscribe to a topic. Returns unsubscribe function. */
  subscribe(topic: string, handler: TopicHandler, variables?: unknown): () => void;
  /** Send a message to a topic. Queued if reconnecting. */
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
