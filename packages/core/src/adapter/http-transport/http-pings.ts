/** The heartbeat's pings on a connection over HTTP, and the pongs given for its client. */
export interface Pings {
  /** The heartbeat sent a ping: carried now when an answer is held, by the next one otherwise */
  sent(carried: boolean): void;
  /** The client is there: the ping it owes an answer to is answered for it */
  heard(): void;
  /** Whether a ping waits for an answer to carry it; it is carried by the one that asks */
  takeUnsent(): boolean;
}

/**
 * The heartbeat over HTTP, with no ping and pong of the client's own: an
 * answer held open, or a request with the connection's token, shows the
 * client is there, and the pong the heartbeat waits for is given for it
 * then — once the heartbeat has begun to wait, on a microtask. The ping is
 * still carried to the client, which hears the server is there from it.
 *
 * @param pong - Gives the handler the pong
 * @returns The connection's pings
 * @example
 * ```ts
 * const pings = createPings(() => listeners.message(PONG_FRAME));
 * pings.sent(delivery !== undefined);
 * ```
 */
export function createPings(pong: () => void): Pings {
  let owed = false;
  let unsent = false;
  function heard(): void {
    if (!owed) return;
    owed = false;
    queueMicrotask(pong);
  }
  return {
    sent(carried) {
      owed = true;
      unsent = !carried;
      if (carried) heard();
    },
    heard,
    takeUnsent() {
      const was = unsent;
      unsent = false;
      return was;
    },
  };
}
