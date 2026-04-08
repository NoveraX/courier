/**
 * WebSocket heartbeat (ping/pong) manager.
 * Detects dead connections by sending periodic pings
 * and expecting pongs within a timeout window.
 */

const DEFAULT_INTERVAL_MS = 25_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface HeartbeatConfig {
  /** Interval between pings in ms (default 25000) */
  intervalMs?: number;
  /** Time to wait for pong before considering connection dead (default 10000) */
  timeoutMs?: number;
}

export interface Heartbeat {
  /** Start the heartbeat timer. Calling start() when already running is a no-op. */
  start(): void;
  /** Signal that a pong was received, resetting the timeout. */
  receivedPong(): void;
  /** Stop all timers. */
  stop(): void;
}

/**
 * Creates a heartbeat manager for WebSocket connections.
 *
 * @param sendPing - Called at each interval to send a ping frame
 * @param onTimeout - Called when pong is not received within the timeout window
 * @param config - Optional interval and timeout configuration
 * @returns Heartbeat controller with start/stop/receivedPong methods
 *
 * @example
 * ```ts
 * const hb = createHeartbeat(() => ws.ping(), () => ws.close(), { intervalMs: 30000 });
 * hb.start();
 * // on pong frame: hb.receivedPong();
 * // on close: hb.stop();
 * ```
 */
export function createHeartbeat(
  sendPing: () => void,
  onTimeout: () => void,
  config?: HeartbeatConfig,
): Heartbeat {
  const intervalMs = config?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let pongTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearPongTimeout(): void {
    if (pongTimeout !== null) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  }

  function startPongTimeout(): void {
    clearPongTimeout();
    pongTimeout = setTimeout(onTimeout, timeoutMs);
  }

  function start(): void {
    if (pingInterval !== null) return;

    pingInterval = setInterval(() => {
      sendPing();
      startPongTimeout();
    }, intervalMs);
  }

  function receivedPong(): void {
    clearPongTimeout();
  }

  function stop(): void {
    clearPongTimeout();
    if (pingInterval !== null) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  return { start, receivedPong, stop };
}
