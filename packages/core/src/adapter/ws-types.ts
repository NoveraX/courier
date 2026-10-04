import type { Sources } from "../define/types";
import type { PubSubAdapter, WebSocketLike } from "../realtime/adapters";
import type { ConnectionMeta, ConnectResult } from "./connection-meta";
import type { ClientIPResolver } from "./ws-ip-tracker";
import type { ConnectionRegistry } from "./ws-registry-types";

/**
 * Configuration for the server-side WebSocket handler.
 *
 * Framework adapters call `createWSHandler()` with just the behavioral
 * options, and sources are read from the core global registry when each
 * connection opens.
 *
 * `TConnect` is what `onConnect` returns, which types the `meta` every other
 * hook receives; it is inferred from `onConnect` itself.
 */
export interface WSHandlerConfig<TConnect extends ConnectResult = ConnectResult> {
  /**
   * The sources this handler answers for. Left out, it answers for the
   * process-wide registry that `attachRuntime()` and `registerSources` fill.
   * A server handed its own sources passes them here, so another server or
   * a later `registerSources` in the same process cannot change what it
   * serves.
   */
  sources?: Sources | undefined;
  /** Optional pub/sub adapter for horizontal scaling (e.g. Redis) */
  pubsub?: PubSubAdapter | undefined;
  /** Heartbeat interval in ms (default 25000) */
  heartbeatIntervalMs?: number | undefined;
  /** Pong timeout in ms (default 10000) */
  heartbeatTimeoutMs?: number | undefined;
  /** Max buffered bytes before dropping messages (default 1MB) */
  maxBufferedAmount?: number | undefined;
  /**
   * Origins of other pages that may open a socket, as `HandlerConfig`'s
   * `allowedOrigins` rules them: unset, the application's own pages, and in
   * development other local ports. A refused origin is closed with 4403.
   */
  allowedOrigins?: string[] | undefined;
  /**
   * The host names this server is reached by, as `HandlerConfig`'s
   * `allowedHosts` rules them. A socket opened on any other host is closed
   * with 4421.
   */
  allowedHosts?: string[] | undefined;
  /**
   * Max subscriptions per connection (default 100). Its subscribe,
   * unsubscribe and auth frames are counted apart from other messages, up to
   * twice this a second; one past that is refused with a 4429 error.
   */
  maxSubscriptionsPerConnection?: number | undefined;
  /** Max inbound message size in bytes (default 65536 = 64KB) */
  maxMessageSize?: number | undefined;
  /** Middleware execution timeout in ms (default 30000) */
  middlewareTimeoutMs?: number | undefined;
  /** Max inbound messages per second per connection — token bucket (default 100) */
  maxMessagesPerSecond?: number | undefined;
  /** Max concurrent connections from a single IP address (default 50) */
  maxConnectionsPerIP?: number | undefined;
  /**
   * Names the address a connection is counted against. A `Request` carries no
   * peer address, so without this the cap falls back to forwarding headers —
   * which the caller writes. Supply this wherever the runtime knows the real
   * address, and the cap becomes a guarantee instead of a default.
   */
  clientIp?: ClientIPResolver | undefined;
  /** Per-subscription authorization — throw or return false to reject */
  authorize?:
    | ((info: {
        connectionId: string;
        meta: ConnectionMeta<TConnect>;
        source: string;
        group: string | undefined;
        method: string;
        topic: string;
        variables: unknown;
      }) => boolean | Promise<boolean>)
    | undefined;
  /**
   * Called after upgrade, before subscriptions. Return the connection's
   * metadata — an object — or nothing, or throw to refuse the connection: it
   * is closed with 4401 "Connection rejected", and what was thrown is logged,
   * never sent. What it returns types `meta` in the hooks written after it.
   */
  onConnect?: ((info: { connectionId: string; request: Request }) => TConnect) | undefined;
  /** Called after socket close + topic cleanup */
  onDisconnect?:
    | ((info: {
        connectionId: string;
        meta: ConnectionMeta<TConnect>;
        code: number;
      }) => void | Promise<void>)
    | undefined;
  /**
   * Called on connection-level error, with the Error the socket reported —
   * such as the RangeError of a frame over the size limit.
   */
  onError?:
    | ((info: { connectionId: string; meta: ConnectionMeta<TConnect>; error: Error }) => void)
    | undefined;
  /** Called when an outbound message is dropped due to buffer overflow */
  onMessageDrop?:
    | ((info: { connectionId: string; topic: string | undefined; bufferedAmount: number }) => void)
    | undefined;
  /** Max consecutive message drops before force-closing a slow connection (default 50, 0 = disabled) */
  maxConsecutiveDrops?: number | undefined;
  /**
   * Checks a token the client sent on its open connection, as
   * `sendAuthRequired` asks it to: return the connection's new metadata, or
   * throw to refuse the token. A refused token — and every token, when this
   * is not set — leaves the deadline `sendAuthRequired` set, so the
   * connection is closed at it.
   */
  onTokenRefresh?:
    | ((info: {
        connectionId: string;
        token: string;
        meta: ConnectionMeta<TConnect>;
      }) => ConnectionMeta<TConnect> | Promise<ConnectionMeta<TConnect>>)
    | undefined;
  /** Per-message authorization — return false or throw to reject with 4403 */
  authorizeMessage?:
    | ((info: {
        connectionId: string;
        meta: ConnectionMeta<TConnect>;
        topic: string;
        payload: unknown;
      }) => boolean | Promise<boolean>)
    | undefined;
  /** Timeout in ms for token refresh after sending auth_required (default 30000) */
  authRequiredTimeoutMs?: number | undefined;
}

/** Active subscription entry tracked per connection */
export interface WSSubscriptionEntry {
  /** Topic string (e.g. "chat.messages") */
  topic: string;
  /** Cleanup function — calls onLeave or cancels generator */
  cleanup: () => void | Promise<void>;
  /** Channel message handler — called on incoming "message" for this topic */
  onMessage?: (payload: unknown) => void | Promise<void>;
}

/** Server-side WS handler returned by createWSHandler */
export interface WSHandler {
  /**
   * Handle an upgraded WebSocket connection.
   *
   * `peerAddress` is the socket's remote address, for a runtime whose
   * request does not carry one. Without it, and without a proxy's
   * forwarding headers, every caller is counted against one address, and
   * `maxConnectionsPerIP` caps the whole server.
   */
  handleSocket(ws: WebSocketLike, request: Request, peerAddress?: string): void;
  /** Registry of active connections with send/broadcast/disconnect API */
  readonly connections: ConnectionRegistry;
  /** Clean up pubsub subscriptions and internal state (call on server shutdown) */
  destroy(): Promise<void>;
}
