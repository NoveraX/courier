import { CLIENT_LIMITS } from "../client-limits";
import { ConnectionError } from "../errors";
import { WS_CODE } from "../ws/ws-codes";

const LINE_END = /\r\n|\r|\n/;

/**
 * A line or an event of a stream longer than the client reads: a server
 * that never ends one, or the answer of something that is no event stream.
 * The stream ends with it, as reading it again would meet it again; its
 * code is a socket's for a message too large.
 */
export class EventTooLarge extends ConnectionError {
  constructor() {
    super(
      `A line or an event of the stream ran past ${CLIENT_LIMITS.SSE_MAX_EVENT_LENGTH} characters`,
      WS_CODE.MESSAGE_TOO_BIG,
    );
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
 * the middle of one. Text that runs past `SSE_MAX_EVENT_LENGTH` with no line
 * end ends the read, rather than being held, and searched again for one with
 * each piece that comes.
 *
 * @param stream - The response body
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
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const { lines, rest } = splitLines(pending, done);
      if (rest.length > CLIENT_LIMITS.SSE_MAX_EVENT_LENGTH) throw new EventTooLarge();
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
