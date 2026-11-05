import { LIMITS } from "./limits";

/** The values a WebSocket server of the protocol keeps when its options name nothing. */
export interface WSDefaults {
  /** How often the server sends `ping` (25 s) */
  readonly heartbeatIntervalMs: number;
  /** How long it waits for the `pong` (10 s) */
  readonly heartbeatTimeoutMs: number;
  /** How long it waits for the client's first frame (3 s) */
  readonly authTimeoutMs: number;
  /** The largest message it reads (64 KiB) */
  readonly maxMessageSize: number;
  /** The most subscriptions one connection holds (100) */
  readonly maxSubscriptions: number;
}

/**
 * What a WebSocket server of the protocol keeps when its options name
 * nothing: its heartbeat, how long it waits for a client's first frame, the
 * largest message it reads and the most subscriptions it holds — the values
 * `auth_ok` tells a client. A mock's server keeps them too, so a client
 * meets the same ones wherever it connects.
 *
 * @example
 * ```ts
 * const intervalMs = config.heartbeatIntervalMs ?? WS_DEFAULTS.heartbeatIntervalMs;
 * ```
 */
export const WS_DEFAULTS: WSDefaults = {
  heartbeatIntervalMs: 25_000,
  heartbeatTimeoutMs: 10_000,
  authTimeoutMs: 3_000,
  maxMessageSize: LIMITS.MAX_MESSAGE_SIZE,
  maxSubscriptions: LIMITS.MAX_SUBSCRIPTIONS_PER_CONNECTION,
};
