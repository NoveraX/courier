import { LIMITS } from "../limits";
import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import type { WSMessageType } from "../realtime/ws/ws-protocol";
import type { WSSession } from "./ws-session";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/**
 * What a slow reader may lose of a frame: an `event` — a topic's `data` or
 * `skip` — while its socket's buffer is over `maxBufferedAmount`; a
 * `control` frame never, as without it the client would be wrong about its
 * subscriptions: one confirmed, ended or renamed, a sequence begun anew.
 */
export type FrameKind = "event" | "control";

/**
 * The kind of a frame of a type.
 *
 * @param type - The frame's type
 * @returns `event` for `data` and `skip`, `control` for any other
 * @example
 * ```ts
 * kindOf("subscribed"); // "control"
 * ```
 */
export function kindOf(type: WSMessageType): FrameKind {
  return type === "data" || type === "skip" ? "event" : "control";
}

/** What a connection may send now, and what it has dropped for a slow reader. */
export interface Backpressure {
  /**
   * Whether a frame goes out now: the socket is open, and an event only
   * while the buffer is under the limit. An event that does not is dropped:
   * counted, reported, and the connection closed as a slow consumer once too
   * many in a row were.
   */
  admits(kind: FrameKind, topic: string | undefined): boolean;
  /** The events dropped so far */
  readonly dropped: number;
}

/**
 * The backpressure guard of one connection: a client that reads slowly
 * loses a topic's events, never what it is told of its subscriptions.
 *
 * @param ws - The socket
 * @param session - The connection's session, which closes a slow consumer
 * @param config - `maxBufferedAmount`, `maxConsecutiveDrops`, `onMessageDrop`
 * @param connectionId - The connection, as a drop is reported
 * @returns The guard
 * @example
 * ```ts
 * const backpressure = createBackpressure(ws, session, config, connectionId);
 * if (backpressure.admits("event", topic)) ws.send(frame);
 * ```
 */
export function createBackpressure(
  ws: WebSocketLike,
  session: WSSession,
  config: WSHandlerConfig,
  connectionId: string,
): Backpressure {
  const maxBuf = config.maxBufferedAmount ?? LIMITS.MAX_BUFFERED_AMOUNT;
  const maxConsecutiveDrops = config.maxConsecutiveDrops ?? LIMITS.MAX_CONSECUTIVE_DROPS;
  let consecutiveDrops = 0;
  let dropped = 0;
  return {
    admits(kind, topic) {
      if (ws.readyState !== 1) return false;
      if (ws.bufferedAmount <= maxBuf) {
        consecutiveDrops = 0;
        return true;
      }
      /* Sent behind what the buffer holds; the run of drops goes on, as the buffer has not drained. */
      if (kind === "control") return true;
      dropped++;
      consecutiveDrops++;
      log.warn(
        `Buffer overflow — dropped (conn=${connectionId}, buf=${ws.bufferedAmount}, drops=${consecutiveDrops})`,
      );
      config.onMessageDrop?.({ connectionId, topic, bufferedAmount: ws.bufferedAmount });
      if (maxConsecutiveDrops > 0 && consecutiveDrops >= maxConsecutiveDrops) {
        log.warn(`Persistent overflow — closing slow connection (conn=${connectionId})`);
        session.close({ kind: "slow-consumer" });
      }
      return false;
    },
    get dropped() {
      return dropped;
    },
  };
}
