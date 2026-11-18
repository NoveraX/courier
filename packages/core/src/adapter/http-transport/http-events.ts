import { HTTP_EVENTS, type HTTPOpening, PING_FRAME } from "../../realtime/ws/http-protocol";

/* The events of an answer, each encoded once: a frame kept for resending is resent as its bytes. */
const encoder = new TextEncoder();

/** The heartbeat's ping, sent without a number: a lost one needs no resending. */
export const PING_EVENT: Uint8Array = encoder.encode(`data: ${PING_FRAME}\n\n`);

/** What a stream after the first begins with, so its client sees at once that it streams. */
export const STREAM_START: Uint8Array = encoder.encode(":\n\n");

/** What the answer to a stream begins with when another replica holds its connection. */
export const RELAYED_EVENT: Uint8Array<ArrayBuffer> = namedEvent(HTTP_EVENTS.relayed, {});

/**
 * One of the server's frames, numbered on its connection.
 *
 * @param seq - Its sequence number
 * @param frame - The frame, one line of JSON
 * @returns The event's bytes
 * @example
 * ```ts
 * frameEvent(7, '{"type":"pong"}'); // id: 7\ndata: {"type":"pong"}\n\n
 * ```
 */
export function frameEvent(seq: number, frame: string): Uint8Array {
  return encoder.encode(`id: ${seq}\ndata: ${frame}\n\n`);
}

/**
 * The event that begins a connection's first answer.
 *
 * @param opening - Its token, how much the client takes before it acknowledges unasked, and the largest body
 * @returns The event's bytes
 * @example
 * ```ts
 * openEvent({ token, ackBytes: 65_536, maxBytes: 1_048_576 });
 * ```
 */
export function openEvent(opening: HTTPOpening): Uint8Array {
  return namedEvent(HTTP_EVENTS.open, opening);
}

/**
 * The event that ends a connection the server closed, after its last frame.
 *
 * @param close - The code and the reason
 * @returns The event's bytes
 * @example
 * ```ts
 * closeEvent({ code: 4408, reason: "Heartbeat timeout" });
 * ```
 */
export function closeEvent(close: { readonly code: number; readonly reason: string }): Uint8Array {
  return namedEvent(HTTP_EVENTS.close, { code: close.code, reason: close.reason });
}

function namedEvent(name: string, data: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}
