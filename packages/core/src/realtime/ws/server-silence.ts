import type { ScopedLogger } from "../../logger";

/**
 * Server-silence watchdog for a WebSocket connection.
 *
 * The mock/server pings every ~25s; if the client receives nothing
 * (data or ping) for `silenceMs`, the connection is considered dead and
 * the provided callback is invoked. The client itself never sends pings —
 * it relies entirely on server liveness signals.
 */
export interface ServerSilenceDetector {
  /** Arm the watchdog (idempotent) */
  start(): void;
  /** Reset the watchdog after receiving any frame from the server */
  reset(): void;
  /** Disarm the watchdog */
  stop(): void;
}

export function createServerSilence(opts: {
  silenceMs: number;
  log: ScopedLogger;
  onSilenceTimeout: () => void;
}): ServerSilenceDetector {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      opts.log.warn("Server silence — no data or ping received");
      opts.onSilenceTimeout();
    }, opts.silenceMs);
  };

  return {
    start: arm,
    reset: arm,
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
