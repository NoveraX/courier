import type { ConnectionState } from "./connection-state";
import type { ConnectionStatus } from "./types";

/**
 * Forward an upstream WS/SSE connection status into a {@link ConnectionState}
 * with exhaustive case coverage.
 *
 * The realtime client wrappers ({@link executeWSPush}, {@link executeWSChannel},
 * SSE auto-reconnect) must surface every status the underlying connection can
 * report — including `"reconnecting"`, which subscribers like the Studio
 * Playground proxy executor's first-attempt watchdog rely on to detect connect
 * failures instead of hanging forever in `"connecting"`.
 *
 * Hand-rolling the switch in each call site is how we previously regressed
 * `"reconnecting"` forwarding. Centralizing it here means a future case added
 * to {@link ConnectionStatus} will fail the `status satisfies never`
 * exhaustiveness check at compile time.
 *
 * @param onDisconnected Optional cleanup callback fired AFTER the state has
 *   been set to `"disconnected"`. Used by `executeWSPush` to flip its async
 *   iterator's `finished` flag and resolve the pending waiter.
 */
export function forwardConnectionStatus(
  state: ConnectionState,
  status: ConnectionStatus,
  onDisconnected?: () => void,
): void {
  switch (status) {
    case "connecting":
      state.set("connecting");
      return;
    case "connected":
      state.set("connected");
      return;
    case "reconnecting":
      state.set("reconnecting");
      return;
    case "disconnected":
      state.set("disconnected");
      onDisconnected?.();
      return;
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return;
    }
  }
}
