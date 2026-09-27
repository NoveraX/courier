const LINE_END = /\r\n|\r|\n/;

/**
 * Read the lines of an event stream: text ended by a CRLF, a lone LF or a
 * lone CR, in any mix, as the HTML standard reads them.
 *
 * Splitting on a blank-line pattern instead missed a blank line written with
 * mixed endings — `\n\r\n` or `\r\n\n` — and merged the events on either side
 * of it. A CR that ends a chunk is held until the next one says whether an LF
 * follows it, so a CRLF split across chunks is one line ending, not two. Text
 * after the last line ending is not a line: a stream that ends there ended in
 * the middle of one.
 *
 * @param stream - The response body
 * @returns Each complete line, without its ending
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
