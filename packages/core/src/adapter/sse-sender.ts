import type { SSEEvent } from "../realtime/types";
import { formatSSEEvent } from "./format-sse";
import { LIMITS } from "./limits";
import { safeSend } from "./sse-stream-lifecycle";

const ENCODER = new TextEncoder();

/** Everything written to one SSE stream. */
export interface SSESender {
  /**
   * Write one of the generator's events, numbered from the stream's counter
   * unless it has an id of its own. The generator waits for room first, so
   * it is queued however full the buffer is.
   *
   * @param event - The event
   * @returns The bytes written, or `false` when the stream has closed
   */
  send(event: SSEEvent<unknown>): number | false;
  /**
   * Write an event from outside the generator. It carries only an id of its
   * own, so it never moves the point a reconnecting client resumes from, and
   * it is dropped rather than queued for a client that has fallen behind.
   *
   * @param event - The event
   * @returns The bytes written, or `false` when it was not
   */
  broadcast(event: SSEEvent<unknown>): number | false;
  /**
   * Write a notice from the server about the stream itself, already formatted.
   *
   * @param frame - The notice, as it goes on the wire
   * @returns Whether it was written
   */
  notice(frame: string): boolean;
  /** Write a comment line — a heartbeat — unless the client has stopped reading. */
  comment(text: string): void;
  /** Whether the buffer has room for more. */
  readonly hasRoom: boolean;
}

/**
 * Create the writer for one stream.
 *
 * Only the generator's events are numbered, by one counter, so the ids a
 * client sees never go backwards and `Last-Event-ID` resumes from the right
 * place: a broadcast the generator cannot replay is no place to resume from,
 * and in a stream whose endpoint names its own ids a number would stand in
 * for the one it last named. A broadcast that does not fit a client that has
 * stopped reading is dropped and reported as not delivered, rather than
 * queued while memory grows without bound, and after
 * `LIMITS.MAX_CONSECUTIVE_DROPS` in a row the stream is closed.
 *
 * @param controller - The stream's controller, over a byte-sized queue
 * @param onSlowConsumer - Called once the client has fallen too far behind
 * @returns The writer
 * @example
 * ```ts
 * const sender = createSSESender(controller, () => abort("slow_consumer"));
 * sender.send({ data: tick });
 * ```
 */
export function createSSESender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  onSlowConsumer: () => void,
): SSESender {
  let seq = 0;
  let drops = 0;
  const free = () => controller.desiredSize ?? 0;
  const write = (chunk: Uint8Array) => (safeSend(controller, chunk) ? chunk.byteLength : false);

  return {
    send(event) {
      return write(ENCODER.encode(formatSSEEvent(event, ++seq)));
    },
    broadcast(event) {
      const chunk = ENCODER.encode(formatSSEEvent(event));
      /* An empty buffer takes any event, however large; a full one drops a
         broadcast rather than holding it for a reader that is not there. */
      const fits = free() >= LIMITS.SSE_MAX_BUFFERED_BYTES || free() >= chunk.byteLength;
      if (!fits) {
        drops += 1;
        if (LIMITS.MAX_CONSECUTIVE_DROPS > 0 && drops >= LIMITS.MAX_CONSECUTIVE_DROPS)
          onSlowConsumer();
        return false;
      }
      drops = 0;
      return write(chunk);
    },
    notice(frame) {
      return safeSend(controller, ENCODER.encode(frame));
    },
    comment(text) {
      if (free() > 0) safeSend(controller, ENCODER.encode(text));
    },
    get hasRoom() {
      return free() > 0;
    },
  };
}
