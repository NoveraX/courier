import type { SSEEvent } from "../realtime/types";
import { formatSSEEvent } from "./format-sse";
import { LIMITS } from "./limits";
import { safeSend } from "./sse-stream-lifecycle";

const ENCODER = new TextEncoder();

/** Everything written to one SSE stream. */
export interface SSESender {
  /**
   * Write an event, numbered from the stream's own counter.
   *
   * @param event - The event
   * @param mayDrop - Whether a full buffer drops it rather than queueing it
   * @returns The bytes written, or `false` when it was not
   */
  send(event: SSEEvent<unknown>, mayDrop: boolean): number | false;
  /** Write a comment line — a heartbeat — unless the client has stopped reading. */
  comment(text: string): void;
  /** Whether the buffer has room for more. */
  readonly hasRoom: boolean;
}

/**
 * Create the writer for one stream.
 *
 * Events from the generator and events broadcast to the stream used to be
 * numbered by two counters that both started at 1, so the ids a client saw
 * went backwards and `Last-Event-ID` resumed from the wrong place. And a
 * broadcast queued every event for a client that had stopped reading,
 * reporting each one delivered while memory grew without bound. A broadcast
 * that does not fit is now dropped and reported as not delivered, and after
 * `LIMITS.MAX_CONSECUTIVE_DROPS` in a row the stream is closed.
 *
 * @param controller - The stream's controller, over a byte-sized queue
 * @param onSlowConsumer - Called once the client has fallen too far behind
 * @returns The writer
 */
export function createSSESender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  onSlowConsumer: () => void,
): SSESender {
  let seq = 0;
  let drops = 0;
  const free = () => controller.desiredSize ?? 0;

  return {
    send(event, mayDrop) {
      const chunk = ENCODER.encode(formatSSEEvent(event, ++seq));
      /* An empty buffer takes any event, however large; a full one drops a
         broadcast rather than holding it for a reader that is not there. */
      const fits = free() >= LIMITS.SSE_MAX_BUFFERED_BYTES || free() >= chunk.byteLength;
      if (mayDrop && !fits) {
        drops += 1;
        if (LIMITS.MAX_CONSECUTIVE_DROPS > 0 && drops >= LIMITS.MAX_CONSECUTIVE_DROPS)
          onSlowConsumer();
        return false;
      }
      drops = 0;
      return safeSend(controller, chunk) ? chunk.byteLength : false;
    },
    comment(text) {
      if (free() > 0) safeSend(controller, ENCODER.encode(text));
    },
    get hasRoom() {
      return free() > 0;
    },
  };
}
