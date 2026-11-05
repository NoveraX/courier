/**
 * Centralized limits for WebSocket and SSE adapter subsystems.
 * All magic numbers live here so they can be tuned from a single location.
 */
export const LIMITS = {
  /** Max bytes a socket can buffer before messages are dropped (1 MB) */
  MAX_BUFFERED_AMOUNT: 1_048_576,

  /** Max inbound message size in bytes (64 KB) */
  MAX_MESSAGE_SIZE: 65_536,

  /** Max topic subscriptions a single WS connection may hold */
  MAX_SUBSCRIPTIONS_PER_CONNECTION: 100,

  /** Middleware execution timeout in ms (30 s) */
  MIDDLEWARE_TIMEOUT_MS: 30_000,

  /** Max messages an outbound reconnect queue will buffer */
  MAX_QUEUE_COUNT: 100,

  /** Max total bytes an outbound reconnect queue will buffer (1 MB) */
  MAX_QUEUE_BYTES: 1_048_576,

  /** How long a pooled client socket nothing uses any more stays open for the next user (1 s) */
  WS_IDLE_CLOSE_MS: 1_000,

  /** Max inbound messages per second per WS connection (token bucket) */
  MAX_MESSAGES_PER_SECOND: 100,

  /** Max concurrent WS connections from a single IP address */
  MAX_CONNECTIONS_PER_IP: 50,

  /** Max consecutive message drops before force-closing a slow connection (0 = disabled) */
  MAX_CONSECUTIVE_DROPS: 50,

  /** How long a WebSocket handler's destroy() waits for its connections to close (5 s) */
  WS_SHUTDOWN_TIMEOUT_MS: 5_000,

  /** The span a stopping handler spreads its clients' reconnects over, so they do not come back at once (5 s) */
  WS_SHUTDOWN_RECONNECT_SPREAD_MS: 5_000,

  /** Bytes an SSE stream may hold for a client that is not reading before broadcasts are dropped (1 MB) */
  SSE_MAX_BUFFERED_BYTES: 1_048_576,

  /** Default SSE max connection lifetime in ms (30 minutes) */
  SSE_MAX_LIFETIME_MS: 30 * 60_000,

  /** Longest per-call deadline a proxy client may ask for in ms (2 minutes) */
  MAX_PROXY_TIMEOUT_MS: 120_000,

  /** Largest JSON envelope the proxy will read from a caller (1 MB) */
  MAX_PROXY_BODY_BYTES: 1_048_576,

  /** Largest multipart upload the proxy will read from a caller (10 MB) */
  MAX_PROXY_UPLOAD_BYTES: 10_485_760,

  /** Longest pause between two chunks of a request body before it is refused with 408 (30 s) */
  BODY_IDLE_TIMEOUT_MS: 30_000,

  /** Longest a request body may take to arrive before it is refused with 408 (5 minutes, as Node's `requestTimeout`) */
  BODY_TIMEOUT_MS: 300_000,

  /** Most parts — fields and files — one upload may hold */
  MAX_UPLOAD_PARTS: 1000,

  /** Most bytes the header lines of one part of an upload may take (8 KB) */
  MAX_PART_HEADER_BYTES: 8192,

  /** Size of the pieces an upload's file is gathered in, in memory (64 KB) */
  UPLOAD_SLAB_BYTES: 65_536,

  /** Bytes of one upload's files kept in memory before the rest go to disk, where there is one (1 MB) */
  UPLOAD_MEMORY_BYTES: 1_048_576,
} as const;
