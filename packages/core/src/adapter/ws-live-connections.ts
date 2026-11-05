import type { WebSocketLike } from "../realtime/adapters";
import type { WSSocketContext } from "./ws-context";
import type { SessionClose } from "./ws-dialect";

/** Every socket a handler holds, from its admission to its close, whether its connection is admitted yet or not. */
export interface LiveConnections {
  /** Hold a socket until its close event */
  add(ws: WebSocketLike, ctx: WSSocketContext): void;
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
 * socket the stop has to close as well.
 *
 * @returns The set, empty
 * @example
 * ```ts
 * const live = createLiveConnections();
 * live.add(ws, ctx);
 * await live.closeAll(() => ({ kind: "shutdown", retryAfterMs: 0 }), 5_000);
 * ```
 */
export function createLiveConnections(): LiveConnections {
  const held = new Map<WebSocketLike, WSSocketContext>();
  let emptied: (() => void) | undefined;

  return {
    add(ws, ctx) {
      held.set(ws, ctx);
      ws.addEventListener("close", () => {
        held.delete(ws);
        if (held.size === 0) emptied?.();
      });
    },
    get size() {
      return held.size;
    },
    async closeAll(why, timeoutMs) {
      for (const ctx of [...held.values()]) ctx.session.close(why());
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
