import { parseSSEFrames } from "../sse/parse-sse";
import { isCode, isCount, isString } from "../ws/frame-fields";
import { HTTP_EVENTS, type HTTPOpening } from "../ws/http-protocol";

/**
 * Longest line, and longest event, an answer is read to, in characters.
 * Each of the server's frames comes in one event, so an answer takes a
 * message as large as a socket of the `ws` package takes by default; a
 * browser's socket sets no bound. A larger one closes the connection with
 * 1009, as a socket's message too big does (100 MiB of text).
 */
export const HTTP_MAX_EVENT_LENGTH = 104_857_600;

/** What the socket does with each part of an answer, as it comes. */
export interface AnswerParts {
  /** Bytes of the answer came: whatever holds answers back, if anything does, does not hold this one */
  received(bytes: number): void;
  /** The `open` event, first on a connection's first answer */
  opened(opening: HTTPOpening): void;
  /** One of the server's frames, and its sequence number when it has one */
  frame(data: string, seq: number | undefined): void;
  /** The `close` event: the server closed the connection, after its last frame */
  closed(code: number, reason: string): void;
}

/**
 * Read an answer of events, each part as it comes, until the answer ends:
 * after its last frame, or with the connection's close. A `relayed` event,
 * which begins the answer another replica gave a stream with its holder's
 * poll, needs nothing: the socket asks for its stream again once the answer
 * ends, as after any.
 *
 * The body is read through a pipe the attempt's abort cuts, so an answer
 * given up ends at once, whatever `fetch` made it; the pipe counts its
 * bytes as they come, as the server counts what it keeps. However the read
 * ends — with the answer, with the connection's close, or at an event it
 * cannot take — what is left of the answer is let go of, rather than held
 * open on the way and at the server. A frame may run to
 * `HTTP_MAX_EVENT_LENGTH`, as long as a socket's message.
 *
 * @param body - The answer's body
 * @param parts - What takes each of its parts
 * @param signal - The attempt's
 * @throws {TypeError} For an `open` or a `close` event that says no such thing: no server of this transport sent it
 * @throws EventTooLarge for a line or an event that runs past `HTTP_MAX_EVENT_LENGTH`
 * @example
 * ```ts
 * await readAnswer(response.body, { received, opened, frame, closed }, attempt.signal);
 * ```
 */
export async function readAnswer(
  body: ReadableStream<Uint8Array>,
  parts: AnswerParts,
  signal: AbortSignal,
): Promise<void> {
  const pipe = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (chunk.byteLength === 0) return;
      parts.received(chunk.byteLength);
      controller.enqueue(chunk);
    },
  });
  body.pipeTo(pipe.writable, { signal }).catch(() => undefined);
  try {
    for await (const block of parseSSEFrames(pipe.readable, HTTP_MAX_EVENT_LENGTH)) {
      const { event } = block;
      if (event === undefined) continue;
      switch (event.event) {
        case undefined:
          parts.frame(event.data, event.id === undefined ? undefined : Number(event.id));
          break;
        case HTTP_EVENTS.open:
          parts.opened(openingOf(event.data));
          break;
        case HTTP_EVENTS.close: {
          const { code, reason } = closingOf(event.data);
          parts.closed(code, reason);
          return;
        }
        default:
          /* `relayed`, or an event of a later version of the transport this client needs nothing of. */
          break;
      }
    }
  } finally {
    /* The pipe's last write waits for a read that will not come, so the attempt's abort alone would not let the body go. */
    pipe.readable.cancel().catch(() => undefined);
  }
}

function openingOf(data: string): HTTPOpening {
  const said = fieldsOf(data);
  if (isString(said.token) && isCount(said.ackBytes) && isCount(said.maxBytes)) {
    return { token: said.token, ackBytes: said.ackBytes, maxBytes: said.maxBytes };
  }
  throw new TypeError(`Not the open event of an HTTP transport: ${data}`);
}

function closingOf(data: string): { readonly code: number; readonly reason: string } {
  const said = fieldsOf(data);
  if (isCode(said.code) && typeof said.reason === "string") {
    return { code: said.code, reason: said.reason };
  }
  throw new TypeError(`Not the close event of an HTTP transport: ${data}`);
}

function fieldsOf(data: string): Record<string, unknown> {
  const said: unknown = JSON.parse(data);
  return typeof said === "object" && said !== null ? (said as Record<string, unknown>) : {};
}
