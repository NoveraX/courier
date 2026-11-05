import type { Sources } from "../define/types";
import type {
  ConnectionLeaseStore,
  LeaseOverflow,
  PubSubAdapter,
  WebSocketLike,
} from "../realtime/adapters";
import type { WSAuthParams } from "../realtime/ws/ws-credentials";
import type { ConnectionMeta, ConnectResult } from "./connection-meta";
import type { AllowedHostsSetting } from "./runtime-policy";
import type { WSHandlerStats } from "./ws-handler-stats";
import type { ClientIPResolver } from "./ws-ip-tracker";
import type { ConnectionRegistry } from "./ws-registry-types";
import type { TopicHistoryOptions } from "./ws-topic-history";

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
  /** How the replicas sharing `pubsub` trust the commands they send each other */
  cluster?: WSClusterOptions | undefined;
  /**
   * Keep each topic's recent events, so a subscription that comes back —
   * its client lost the connection — is sent what it missed instead of
   * starting over: `{}` for the defaults, 100 events a topic for a minute,
   * 8 MiB in all. Off unless given: what is kept is memory.
   */
  history?: TopicHistoryOptions | undefined;
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
   * `allowedHosts` rules them — a list, a function read when the first
   * socket opens, or `COURIER_ALLOWED_HOSTS`. A socket opened on any other
   * host is closed with 4421, and so is every socket while the setting
   * cannot be read.
   */
  allowedHosts?: AllowedHostsSetting | undefined;
  /**
   * Max subscriptions per connection (default 100). Its subscribe,
   * unsubscribe and auth frames are counted apart from other messages, up to
   * twice this a second; one past that is refused with a 4429 error.
   */
  maxSubscriptionsPerConnection?: number | undefined;
  /** Max inbound message size in bytes (default 65536 = 64KB) */
  maxMessageSize?: number | undefined;
  /**
   * How long a hook may take, in ms (default 30000): a subscription's
   * middleware and `authorize`, and `onConnect` and `onReauth`. A connection
   * whose `onConnect` has not settled by then is closed with 1011, which a
   * client retries; one whose `onReauth` has not, with 4401.
   */
  middlewareTimeoutMs?: number | undefined;
  /** Max inbound messages per second per connection — token bucket (default 100) */
  maxMessagesPerSecond?: number | undefined;
  /** Max concurrent connections from a single IP address (default 50) */
  maxConnectionsPerIP?: number | undefined;
  /**
   * A limit on the connections that share a key — one user's tabs and
   * devices, one address's — counted on every replica that shares
   * `connectionLeases`; a list of them, several at once. The key is read
   * once `onConnect` has admitted the connection, so the limit needs it.
   */
  maxConnectionsPerKey?:
    | ConnectionLimitRule<ConnectionMeta<TConnect>>
    | readonly ConnectionLimitRule<ConnectionMeta<TConnect>>[]
    | undefined;
  /**
   * Where `maxConnectionsPerKey` counts connections: this replica's memory
   * unless given, or a store every replica shares, so the limit counts the
   * key's connections wherever they are held —
   * `createRedisConnectionLeases()` from `@noverax/courier-redis`.
   */
  connectionLeases?: ConnectionLeaseStore | undefined;
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
   * Called once the client has said who it is, before its subscriptions:
   * `request` is the upgrade request, with the headers of the client's
   * `auth` frame a browser could not put on it — an `Authorization`, an API
   * key — and `auth` is the client's `ws.auth`. Return the connection's
   * metadata — an object — or nothing, or throw to refuse the connection: a
   * `RealtimeError` closes it with its own code and message (`ForbiddenError`
   * with 4403), anything else with 4401 "Connection rejected", what was
   * thrown logged on one line and never sent. What it returns types `meta` in
   * the hooks written after it.
   */
  onConnect?:
    | ((info: {
        connectionId: string;
        request: Request;
        auth: WSAuthParams | undefined;
      }) => TConnect)
    | undefined;
  /**
   * How long `onConnect` waits for the client's `auth` frame, the first a
   * Courier client sends (default 3000 ms). A client that sends none by
   * then, or sends another frame first, is admitted on its handshake alone.
   */
  authTimeoutMs?: number | undefined;
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
   * Checks the credentials a client sends again on its open connection, as
   * `sendAuthRequired` asks it to — `request` and `auth` as `onConnect`
   * reads them, with the new frame's headers. Return the connection's new
   * metadata, or throw to refuse them. Refused credentials close the
   * connection at once with 4401 — and so do any sent again when this is not
   * set, as nothing could check them. Taken, they lift the deadline
   * `sendAuthRequired` set, and when who the connection is changed, each of
   * its subscriptions is authorized again: one `authorize` now refuses ends
   * with 4403.
   */
  onReauth?:
    | ((info: {
        connectionId: string;
        meta: ConnectionMeta<TConnect>;
        request: Request;
        auth: WSAuthParams | undefined;
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
  /**
   * How long a client has to send its credentials again, once
   * `sendAuthRequired` asked for them without naming a deadline of its own,
   * before the connection is closed with 4401 (default 30000).
   */
  authRequiredTimeoutMs?: number | undefined;
}

/** A limit on the connections that share a key — one user's tabs and devices, one address's. */
export interface ConnectionLimitRule<TMeta = Record<string, unknown>> {
  /**
   * The key a connection counts against: from what `onConnect` returned —
   * `(meta) => meta.userId` — or the address the handler counts it against,
   * after `clientIp` and the proxies it trusts — `(_, { clientIp }) => clientIp`.
   * `undefined` puts the connection under no limit of this rule.
   */
  key: (meta: TMeta, connection: { readonly clientIp: string }) => string | undefined;
  /** Connections one key holds at most: a whole number, 1 or more */
  max: number;
  /**
   * Over the limit, the oldest of the key's connections are closed for the
   * new one (`"evict-oldest"`, the default), or the new one is refused
   * (`"reject"`). Either is closed with 4429, which a Courier client does
   * not reconnect on.
   */
  onExceed?: LeaseOverflow | undefined;
}

/** How the replicas of one application trust the commands they send each other. */
export interface WSClusterOptions {
  /**
   * A secret every replica shares, of 32 bytes or more: each command one
   * sends the others — `connections.disconnect`, `connections.requireAuth` —
   * is signed with it, and one that is not, or not with it, is refused.
   * Without it, whoever can publish on the adapter's channels can close any
   * connection: on a Redis anything else reaches, set it, and keep
   * publishing on the prefix's channels to the application with Redis ACLs.
   */
  secret?: string | undefined;
}

/** What a subscription was authorized as: its endpoint and the variables it was made with. */
export interface AuthorizedSubscription {
  readonly source: string;
  readonly group?: string | undefined;
  readonly method: string;
  readonly variables: unknown;
}

/** Active subscription entry tracked per connection */
export interface WSSubscriptionEntry {
  /** Topic string (e.g. "chat.messages") */
  topic: string;
  /** What it was authorized as, so it is authorized again once who the connection is changes */
  authorized?: AuthorizedSubscription | undefined;
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
  /**
   * Stop: every connection is closed — a Courier client reconnects, to
   * another replica behind a load balancer — and waited for until
   * `timeoutMs` (default 5000), sockets handed to it from then on are closed
   * at once, and its pub/sub subscriptions are let go of. It settles within
   * the deadline whatever its clients and its pub/sub adapter do, and a
   * second call is the same stop. The adapter itself is yours to disconnect.
   */
  destroy(options?: { timeoutMs?: number | undefined }): Promise<void>;
  /** What the handler holds and has done: its connections, subscriptions, closes by code, dropped frames, its pub/sub adapter's own */
  stats(): WSHandlerStats;
}

/**
 * What a framework adapter hands back with its WebSocket handler's entry
 * point — `courierWSAttach`'s cleanup, `courierWSHandler`'s route handler —
 * so an application reaches the handler's connections, stops it, and reads
 * its stats as one on `createWSHandler` does.
 */
export interface WSHandlerDescriptor {
  /** The handler's connections; with a pub/sub adapter, broadcasts and commands reach every replica */
  readonly connections: ConnectionRegistry;
  /** Stop the handler within `timeoutMs` (default 5000), as `WSHandler.destroy` does */
  destroy(options?: { timeoutMs?: number | undefined }): Promise<void>;
  /** What the handler holds and has done */
  stats(): WSHandlerStats;
}
