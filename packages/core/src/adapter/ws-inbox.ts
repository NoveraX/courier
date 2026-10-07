import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";

const log = createLogger("WS");

/** The frames a socket sends, held until its connection is admitted. */
export interface WSInbox {
  /**
   * Hand every frame held to `route`, in the order they came, then each
   * frame as it comes.
   */
  open(route: (raw: string) => void): void;
}

/**
 * Listen to a socket from the moment it is admitted, holding what it sends
 * until its connection is: a client subscribes as soon as its socket opens,
 * and a subscription sent while `onConnect` ran was lost, leaving the client
 * connected to nothing. A socket that sends more than `maxHeld` frames
 * before then is closed with 4429.
 *
 * @param ws - The admitted socket
 * @param maxHeld - How many frames it may send before its connection is admitted
 * @returns The inbox, opened once the connection is
 * @example
 * ```ts
 * const inbox = holdFrames(ws, 200);
 * await onConnect(...);
 * inbox.open((raw) => routeMessage(ctx, raw, heartbeat));
 * ```
 */
export function holdFrames(ws: WebSocketLike, maxHeld: number): WSInbox {
  let held: string[] | undefined = [];
  let route: ((raw: string) => void) | undefined;
  ws.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data);
    if (route !== undefined) {
      route(raw);
      return;
    }
    if (held === undefined) return;
    if (held.length < maxHeld) {
      held.push(raw);
      return;
    }
    log.warn(`A socket sent more than ${maxHeld} frames before its connection was admitted`);
    held = undefined;
    ws.close(4429, "Too many messages before the connection was accepted");
  });
  return {
    open(next) {
      const waiting = held ?? [];
      held = undefined;
      route = next;
      for (const raw of waiting) next(raw);
    },
  };
}
