import { passedStream } from "../../utils/passed-stream";
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

/* What counts the bytes of an answer handed over whole, as its text. */
const ENCODER = new TextEncoder();

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
  /** The `refused` event: the answer, begun, stands for this refusal of its request */
  refused(answer: Response): void;
}

/**
 * Read an answer of events, each part as it comes, until the answer ends:
 * after its last frame, with the connection's close, or with a refusal. A
 * `relayed` event, which begins the answer another replica gave a stream
 * with its holder's poll, needs nothing: the socket asks for its stream
 * again once the answer ends, as after any. A `refused` event, which ends
 * such an answer when the holder refused the stream or did not answer, is
 * handed on as the answer it stands for, its status, body and wait.
 *
 * The body is read with its own reader, as a stream the attempt's abort
 * cuts, so an answer given up ends at once, whatever `fetch` made it and
 * whatever implementation of web streams the global classes are; its bytes
 * are counted as they come, as the server counts what it keeps. An answer
 * handed over whole is its text, all of its bytes counted at once. However
 * the read ends — with the answer, with the connection's close, or at an
 * event it cannot take — what is left of the answer is let go of, rather
 * than held open on the way and at the server. A frame may run to
 * `HTTP_MAX_EVENT_LENGTH`, as long as a socket's message.
 *
 * @param answer - The answer's body, or its text where it was handed over whole
 * @param parts - What takes each of its parts
 * @param signal - The attempt's
 * @throws {TypeError} For an `open`, a `close` or a `refused` event that says no such thing: no server of this transport sent it
 * @throws EventTooLarge for a line or an event that runs past `HTTP_MAX_EVENT_LENGTH`
 * @example
 * ```ts
 * await readAnswer(response.body, { received, opened, frame, closed }, attempt.signal);
 * ```
 */
export async function readAnswer(
  answer: ReadableStream<Uint8Array> | string,
  parts: AnswerParts,
  signal: AbortSignal,
): Promise<void> {
  if (typeof answer === "string") {
    if (answer !== "") parts.received(ENCODER.encode(answer).byteLength);
    return readEvents(answer, parts);
  }
  const passed = passedStream(answer, {
    took: (chunk) => {
      if (chunk.byteLength > 0) parts.received(chunk.byteLength);
    },
    signal,
  });
  try {
    await readEvents(passed, parts);
  } finally {
    /* Read to an event it ends at, the rest of the answer is let go of. */
    passed.cancel().catch(() => undefined);
  }
}

/* Each event of the answer handed on, until it ends, the connection closes, or a refusal stands for it. */
async function readEvents(
  answer: ReadableStream<Uint8Array> | string,
  parts: AnswerParts,
): Promise<void> {
  for await (const block of parseSSEFrames(answer, HTTP_MAX_EVENT_LENGTH)) {
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
      case HTTP_EVENTS.refused:
        parts.refused(refusalOf(event.data));
        return;
      default:
        /* `relayed`, or an event of a later version of the transport this client needs nothing of. */
        break;
    }
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

/* The answer a `refused` event stands for, as it would have come. */
function refusalOf(data: string): Response {
  const said = fieldsOf(data);
  const { status, body, retryAfter } = said;
  if (isCount(status) && status >= 400 && status <= 599 && isString(body)) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (isString(retryAfter)) headers.set("Retry-After", retryAfter);
    return new Response(body, { status, headers });
  }
  throw new TypeError(`Not the refused event of an HTTP transport: ${data}`);
}

function fieldsOf(data: string): Record<string, unknown> {
  const said: unknown = JSON.parse(data);
  return typeof said === "object" && said !== null ? (said as Record<string, unknown>) : {};
}
