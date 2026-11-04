/** Watches an open socket for signs of life: every message the server sends is one. */
export interface Liveness {
  /** Take the socket for dead once nothing has come for `silenceMs`. */
  watch(silenceMs: number): void;
  /** A message came. */
  heard(): void;
  /** Ask now: ping, and take the socket for dead if nothing comes in `timeoutMs`. */
  probe(timeoutMs: number): void;
  /** Stop watching. */
  stop(): void;
}

/** What a liveness watch sends with and reports to. */
export interface LivenessOptions {
  /** Send a ping on the socket */
  ping(): void;
  /** Nothing came for `forMs` */
  onSilent(forMs: number): void;
}

/**
 * Watch an open socket for life.
 *
 * A server pings every connection, so a socket nothing has come on for the
 * server's interval and its timeout together is gone even when it still
 * reads as open — a network that dropped without a word sends no close.
 * One timer serves the watch: a message only notes when it came, and the
 * timer, when it fires, waits out what is left, so a busy socket costs no
 * timer per message. A probe asks at once, as when the network comes back.
 *
 * @param options - How to ping, and whom to tell of silence
 * @returns The watch, stopped until `watch` starts it
 * @example
 * ```ts
 * const liveness = createLiveness({ ping: () => socket.send('{"type":"ping"}'), onSilent: drop });
 * liveness.watch(35_000);
 * socket.onmessage = () => liveness.heard();
 * ```
 */
export function createLiveness(options: LivenessOptions): Liveness {
  let silenceMs = 0;
  let lastHeard = 0;
  let watchTimer: ReturnType<typeof setTimeout> | undefined;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;

  function arm(ms: number): void {
    watchTimer = setTimeout(check, ms);
  }

  function check(): void {
    const quietFor = performance.now() - lastHeard;
    if (quietFor < silenceMs) {
      arm(silenceMs - quietFor);
      return;
    }
    watchTimer = undefined;
    options.onSilent(Math.round(quietFor));
  }

  function stop(): void {
    clearTimeout(watchTimer);
    clearTimeout(probeTimer);
    watchTimer = probeTimer = undefined;
  }

  return {
    watch(ms) {
      stop();
      silenceMs = ms;
      lastHeard = performance.now();
      arm(ms);
    },
    heard() {
      lastHeard = performance.now();
      clearTimeout(probeTimer);
      probeTimer = undefined;
    },
    probe(timeoutMs) {
      if (watchTimer === undefined || probeTimer !== undefined) return;
      options.ping();
      probeTimer = setTimeout(() => {
        probeTimer = undefined;
        stop();
        options.onSilent(timeoutMs);
      }, timeoutMs);
    },
    stop,
  };
}
