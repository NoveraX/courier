import type { SourceWebSocket } from "../../http-client/source-transport";
import type { RealtimeError } from "../errors";
import type { BackoffConfig, ConnectionStatus } from "../types";
import type { WSConnectionState } from "./connection-machine-types";
import type { HeartbeatConfig } from "./heartbeat";
import type { MessageQueueConfig } from "./message-queue";
import type { WSAuth, WSCredentials } from "./ws-credentials";

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

/**
 * Opens a socket: the platform's WebSocket by default, another for a test.
 * `headers` go on the handshake, given only where the platform lets a
 * script set them — Node and React Native, never a browser.
 */
export type WSSocketFactory = (
  url: string,
  protocols?: string[],
  headers?: Readonly<Record<string, string>>,
) => WSClientSocket;

// ---------------------------------------------------------------------------
// Connection config
// ---------------------------------------------------------------------------

export interface WSConnectionConfig {
  /** WebSocket endpoint URL */
  url: string;
  /** Sub-protocols for the WS handshake */
  protocols?: string[] | undefined;
  /**
   * The server's ping interval and pong timeout: a socket nothing has come
   * on for both together is taken for gone, even while it reads as open
   */
  heartbeat?: HeartbeatConfig | undefined;
  /** Reconnection backoff configuration */
  backoff?: BackoffConfig | undefined;
  /** What the connection keeps to send while it cannot, and what overflowing it does */
  messageQueue?: MessageQueueConfig | undefined;
  /**
   * Whether the page's resume signals act on the connection (default
   * `true`): one waiting to reconnect does so at once when the network comes
   * back, the page is shown again or its window gets focus, and an open one
   * is checked with a ping. Where there is no page — Node, React Native —
   * there are no signals, and `reconnect()` serves.
   */
  reconnectOnResume?: boolean | undefined;
  /**
   * What each socket opens with — headers for its handshake, where the
   * platform lets a script set them, and the frame it proves who it is with
   * — asked for before every connect and reconnect, and again when the
   * server asks for the frame anew. Never put in the URL, where proxies and
   * servers log it.
   */
  credentials?: (() => WSCredentials | Promise<WSCredentials>) | undefined;
  /** Status change listener */
  onStatusChange?: ((status: ConnectionStatus) => void) | undefined;
  /** Max bufferedAmount before dropping sends (default 1MB) */
  maxBufferedAmount?: number | undefined;
  /**
   * Largest message sent, as the length of its encoded frame — the server's
   * `maxMessageSize` (default 64 KB). A larger one is not sent: its topic
   * hears a 4413 error, and the connection goes on.
   */
  maxMessageSize?: number | undefined;
  /** WebSocket factory — override for testing */
  socketFactory?: WSSocketFactory | undefined;
  /**
   * The `WebSocket` class each socket is constructed with in place of the
   * platform's — the source's `webSocket`: undici's on Node, to go with an
   * undici `dispatcher` of the same version.
   */
  webSocket?: SourceWebSocket | undefined;
  /**
   * What each socket's options carry besides its protocols and headers, where
   * the platform's `WebSocket` takes an options object: undici's `dispatcher`
   * on Node, Bun's `proxy` and `tls`. A browser's socket is opened without
   * them, as its `fetch` ignores what it does not know.
   */
  socketInit?: Readonly<Record<string, unknown>> | undefined;
  /**
   * What decides which subscriptions on one URL share a socket. Options with
   * the same key share one, whatever object they came in; without one, the
   * options object itself decides, so a caller's channels share its socket.
   */
  shareKey?: string | undefined;
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
  "backoff" | "heartbeat" | "messageQueue" | "protocols" | "maxMessageSize" | "reconnectOnResume"
> & {
  /**
   * What the client tells the server about itself — a token, a tenant —
   * sent in the first frame of every socket, never in its URL, and read by
   * the server's `onConnect` as `auth`. A function is called anew before
   * every connect and reconnect, and when the server asks again with
   * `sendAuthRequired`.
   */
  auth?: WSAuth | undefined;
};

// ---------------------------------------------------------------------------
// Topic handler
// ---------------------------------------------------------------------------

/** Callback for incoming messages on a topic */
export type TopicHandler = (payload: unknown) => void;

/** What a subscription's confirmation says about what the client may have missed. */
export interface TopicOpenInfo {
  /** Whether the server sent everything since the client's last position: nothing was missed */
  readonly resumed: boolean;
}

/** Receives everything the server says about one topic */
export interface TopicSubscriber {
  /** A payload the server sent on the topic */
  data(payload: unknown): void;
  /** A message on the topic was refused, or its handler failed; the subscription goes on */
  error?(error: RealtimeError): void;
  /** The server confirmed the subscription: it is running */
  open?(info: TopicOpenInfo): void;
  /**
   * The socket under the subscription went away; it is made again on the
   * next. `error` tells what was lost with it, when something was.
   */
  wait?(error: RealtimeError | undefined): void;
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
  /**
   * Send the socket's credentials again, asked for anew, without
   * reconnecting — as the server asks with `sendAuthRequired`, or once the
   * application has renewed its token. On a connection that is not open it
   * does nothing: the next socket asks for them anyway.
   */
  authenticate(): void;
  /**
   * Connect again now, with credentials asked for anew: a connection waiting
   * out its backoff stops waiting, an open one drops its socket for a new
   * one, and one that was refused tries again. Calls while an attempt is
   * under way are that attempt. A connection the application closed stays
   * closed.
   */
  reconnect(): void;
  /** Close the connection gracefully. */
  close(): void;
  /** Current connection status. */
  readonly status: ConnectionStatus;
  /** Where the connection stands, and why: more than `status` says. */
  readonly state: WSConnectionState;
  /** Subscribe to status changes. Returns unsubscribe. */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
  /** Subscribe to changes of `state`. Returns unsubscribe. */
  onStateChange(handler: (state: WSConnectionState) => void): () => void;
}
