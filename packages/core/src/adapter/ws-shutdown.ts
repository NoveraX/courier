import type { SessionClose } from "./ws-close";
import { WS_SERVER_LIMITS } from "./ws-server-limits";

/**
 * Why a stopping server closes a connection, with the pause its client
 * waits before it comes back: drawn anew for each connection across
 * `WS_SERVER_LIMITS.SHUTDOWN_RECONNECT_SPREAD_MS`, so a server's clients do
 * not all come back at once.
 *
 * @returns The reason, with its pause
 * @example
 * ```ts
 * session.close(shutdownClose()); // { kind: "shutdown", retryAfterMs: 2380 }
 * ```
 */
export function shutdownClose(): SessionClose {
  const spread = WS_SERVER_LIMITS.SHUTDOWN_RECONNECT_SPREAD_MS;
  return { kind: "shutdown", retryAfterMs: Math.floor(Math.random() * spread) };
}
