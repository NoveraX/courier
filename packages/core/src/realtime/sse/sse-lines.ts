import { CLIENT_LIMITS } from "../client-limits";

const LINE_END = /\r\n|\r|\n/;

/**
 * A line or an event of a stream longer than its reader takes: a server
 * that never ends one, or the answer of something that is no event stream.
 * The read ends with it, as reading the stream again would meet it again;
 * what that ends is the reader's to say — an SSE subscription ends with a
 * ConnectionError of 1009, a socket's code for a message too large.
 */
export class EventTooLarge extends Error {
  constructor(
    /** How many characters a line or an event may run to */
    readonly bound: number,
  ) {
    super(`A line or an event of the stream ran past ${bound} characters`);
    this.name = "EventTooLarge";
  }
}

/**
 * Read the lines of an event stream: text ended by a CRLF, a lone LF or a
 * lone CR, in any mix, as the HTML standard reads them.
 *
 * Splitting on a blank-line pattern instead missed a blank line written with
 * mixed endings — `\n\r\n` or `\r\n\n` — and merged the events on either side
 * of it. A CR that ends a chunk is held until the next one says whether an LF
 * follows it, so a CRLF split across chunks is one line ending, not two. Text
 * after the last line ending is not a line: a stream that ends there ended in
 * the middle of one. Text that runs past `bound` with no line end ends the
 * read, rather than being held, and searched again for one with each piece
 * that comes.
 *
 * @param stream - The response body
 * @param bound - How many characters a line may run to: an SSE stream's `SSE_MAX_EVENT_LENGTH` unless given
 * @returns Each complete line, without its ending
 * @throws EventTooLarge for a line that runs past its bound
 * @example
 * ```ts
 * for await (const line of readSSELines(response.body)) {
 *   if (line === "") dispatch();
 * }
 * ```
 */
export async function* readSSELines(
  stream: ReadableStream<Uint8Array>,
  bound: number = CLIENT_LIMITS.SSE_MAX_EVENT_LENGTH,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const { lines, rest } = splitLines(pending, done);
      if (rest.length > bound) throw new EventTooLarge(bound);
      pending = rest;
      yield* lines;
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

function splitLines(text: string, final: boolean): { lines: string[]; rest: string } {
  const heldCR = !final && text.endsWith("\r");
  const lines = (heldCR ? text.slice(0, -1) : text).split(LINE_END);
  const rest = lines.pop() ?? "";
  return { lines, rest: heldCR ? `${rest}\r` : rest };
}
