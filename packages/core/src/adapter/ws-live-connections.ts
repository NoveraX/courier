import type { WebSocketLike } from "../realtime/adapters";
import type { SessionClose } from "./ws-close";
import type { WSSession } from "./ws-session";

/** Every socket a handler holds, from its admission to its close, whether its connection is admitted yet or not. */
export interface LiveConnections {
  /** Hold a socket, with its session, until its close event */
  add(ws: WebSocketLike, session: WSSession): void;
  readonly size: number;
  /**
   * Close every socket held, each for the reason `why` gives it, and
   * resolve once all have closed or `timeoutMs` has passed, whichever
   * comes first.
   */
  closeAll(why: () => SessionClose, timeoutMs: number): Promise<void>;
}

/**
 * The sockets of a handler, for a stop that must reach every one: a
 * connection still running `onConnect` is in no registry, yet it holds a
 * socket the stop has to close as well, and so does one being refused.
 *
 * @returns The set, empty
 * @example
 * ```ts
 * const live = createLiveConnections();
 * live.add(ws, session);
 * await live.closeAll(() => ({ kind: "shutdown", retryAfterMs: 0 }), 5_000);
 * ```
 */
export function createLiveConnections(): LiveConnections {
  const held = new Map<WebSocketLike, WSSession>();
  let emptied: (() => void) | undefined;

  return {
    add(ws, session) {
      held.set(ws, session);
      ws.addEventListener("close", () => {
        held.delete(ws);
        if (held.size === 0) emptied?.();
      });
    },
    get size() {
      return held.size;
    },
    async closeAll(why, timeoutMs) {
      for (const session of [...held.values()]) session.close(why());
      if (held.size === 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>((resolve) => {
        emptied = resolve;
        timer = setTimeout(resolve, timeoutMs);
      });
      clearTimeout(timer);
      emptied = undefined;
    },
  };
}
