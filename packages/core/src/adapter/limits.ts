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

  /** Max inbound messages per second per WS connection (token bucket) */
  MAX_MESSAGES_PER_SECOND: 100,

  /** Max concurrent WS connections from a single IP address */
  MAX_CONNECTIONS_PER_IP: 50,

  /** Max consecutive message drops before force-closing a slow connection (0 = disabled) */
  MAX_CONSECUTIVE_DROPS: 50,

  /** Default SSE max connection lifetime in ms (30 minutes) */
  SSE_MAX_LIFETIME_MS: 30 * 60_000,

  /** Longest per-call deadline a proxy client may ask for in ms (2 minutes) */
  MAX_PROXY_TIMEOUT_MS: 120_000,

  /** Largest JSON envelope the proxy will read from a caller (1 MB) */
  MAX_PROXY_BODY_BYTES: 1_048_576,

  /** Largest multipart upload the proxy will read from a caller (10 MB) */
  MAX_PROXY_UPLOAD_BYTES: 10_485_760,
} as const;
