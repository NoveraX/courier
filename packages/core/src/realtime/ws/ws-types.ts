import type { RealtimeError } from "../errors";
import type { BackoffConfig, ConnectionStatus } from "../types";
import type { HeartbeatConfig } from "./heartbeat";
import type { MessageQueueConfig } from "./message-queue";

// ---------------------------------------------------------------------------
// Client-side WebSocket interface (browser-compatible)
// ---------------------------------------------------------------------------

/** What the client reads of a message a socket received: its data. */
export interface WSMessageEventLike {
  readonly data: unknown;
}

/** What the client reads of a socket's closing: its code and reason. */
export interface WSCloseEventLike {
  readonly code: number;
  readonly reason: string;
}

/*
 * A socket's handler property. Written through a method so that a socket
 * whose events carry more — the browser's, Node's, `ws`'s — is accepted:
 * TypeScript compares a method's parameters in both directions, and a plain
 * function property would take only an event type no socket declares.
 */
type SocketHandler<TEvent> = { handle(event: TEvent): void }["handle"] | null;

/**
 * The WebSocket the client drives — the browser's, Node's global one, or a
 * `ws` socket — as far as it uses one. Named without the DOM library's event
 * types, so a project typed for Node alone compiles against it.
 */
export interface WSClientSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
  onopen: SocketHandler<unknown>;
  onmessage: SocketHandler<WSMessageEventLike>;
  onclose: SocketHandler<WSCloseEventLike>;
  onerror: SocketHandler<unknown>;
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
  /** WebSocket factory — override for testing */
  socketFactory?: WSSocketFactory;
}

/**
 * What a caller says about the WebSocket connections its channels and push
 * subscriptions open — the `ws` option of `createCaller`, `createProxyCaller`
 * and the React callers.
 *
 * Every subscription of one caller on one URL shares a socket, so these are
 * the socket's options, not an endpoint's. A caller with options of its own
 * opens its own socket beside another caller's on the same URL.
 */
export type CallerWSOptions = Pick<
  WSConnectionConfig,
  "getAuthToken" | "backoff" | "heartbeat" | "messageQueue" | "protocols" | "maxMessageSize"
>;

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
   *
   * @returns Whether it went out or waits to; `false`, with a warning, when
   *   it was dropped
   */
  send(topic: string, payload: unknown): boolean;
  /** Send a new auth token to the server without reconnecting. */
  refreshToken(token: string): void;
  /** Close the connection gracefully. */
  close(): void;
  /** Current connection status. */
  readonly status: ConnectionStatus;
  /** Subscribe to status changes. Returns unsubscribe. */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
}
