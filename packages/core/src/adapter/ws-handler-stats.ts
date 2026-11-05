import type { PubSubStats } from "../realtime/adapters";

/** What a WebSocket handler holds and has done, as a metrics scrape or a health check reads it. */
export interface WSHandlerStats {
  /** Connections admitted and open on this replica */
  readonly connections: number;
  /** Sockets held that are no connection yet: still being admitted, or closing once refused */
  readonly admitting: number;
  /** Topics with a subscriber on this replica */
  readonly topics: number;
  /** Subscriptions on this replica, every connection's together */
  readonly subscriptions: number;
  /** How many sockets the handler closed, by the code it closed them with: `{ "4401": 3 }` */
  readonly closed: Readonly<Record<string, number>>;
  /** Frames not sent because their connection's buffer was full */
  readonly droppedFrames: number;
  /** Whether `destroy()` has begun */
  readonly stopping: boolean;
  /** The pub/sub adapter's own, when the handler has one */
  readonly pubsub: PubSubStats | undefined;
}

/** The counts a handler keeps as it runs. */
export interface HandlerCounters {
  /** A socket the handler closed, with its code */
  closedWith(code: number): void;
  /** A frame dropped for a full buffer */
  droppedFrame(): void;
  readonly closed: Readonly<Record<string, number>>;
  readonly droppedFrames: number;
}

/**
 * The counts behind a handler's `stats()`. Close codes are few — those a
 * socket can send — so counting by code stays bounded however many
 * connections come and go.
 *
 * @returns The counters, at zero
 * @example
 * ```ts
 * const counters = createHandlerCounters();
 * counters.closedWith(4401);
 * counters.closed; // { "4401": 1 }
 * ```
 */
export function createHandlerCounters(): HandlerCounters {
  const closed: Record<string, number> = {};
  let droppedFrames = 0;
  return {
    closedWith(code) {
      closed[code] = (closed[code] ?? 0) + 1;
    },
    droppedFrame() {
      droppedFrames++;
    },
    get closed() {
      return { ...closed };
    },
    get droppedFrames() {
      return droppedFrames;
    },
  };
}
