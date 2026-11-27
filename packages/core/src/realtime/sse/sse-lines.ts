import { CLIENT_LIMITS } from "../client-limits";

const LINE_END = /\r\n|\r|\n/;
const CR = 0x0d;
const LF = 0x0a;

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
 * of it. A CR that ends a piece of the stream ends its line at once, and an
 * LF that begins the next piece is that CRLF's, not a line ending of its own.
 * Text after the last line ending is not a line: a stream that ends there
 * ended in the middle of one. A line that comes in many pieces is held in
 * them, each read once, and joined when it ends, so it costs its length, not
 * its length again for every piece; one that runs past `bound` ends the read.
 * An answer handed over whole, as React Native's own fetch hands one, is
 * read as its text, one piece.
 *
 * @param source - The response body, or its text where it was handed over whole
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
  source: ReadableStream<Uint8Array> | string,
  bound: number = CLIENT_LIMITS.SSE_MAX_EVENT_LENGTH,
): AsyncGenerator<string, void, unknown> {
  const linesOf = lineSplitter(bound);
  if (typeof source === "string") {
    yield* linesOf(source);
    return;
  }
  const reader = source.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield* linesOf(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

/* What takes a stream's text one piece at a time, and gives each line a piece ends, in order. */
function lineSplitter(bound: number): (piece: string) => Generator<string, void, unknown> {
  /* The pieces of the line no line end has ended yet, and the characters they run to. */
  const held: string[] = [];
  let heldLength = 0;
  /* Whether the last piece ended with a CR: an LF that begins the next ends no line. */
  let afterCR = false;

  return function* linesOf(piece) {
    let text = piece;
    if (text === "") return;
    if (afterCR && text.charCodeAt(0) === LF) text = text.slice(1);
    afterCR = text.charCodeAt(text.length - 1) === CR;
    const lines = text.split(LINE_END);
    const rest = lines.pop() ?? "";
    for (let at = 0; at < lines.length; at++) {
      let line = lines[at] as string;
      if (at === 0 && held.length > 0) {
        if (heldLength + line.length > bound) throw new EventTooLarge(bound);
        held.push(line);
        line = held.join("");
        held.length = 0;
        heldLength = 0;
      } else if (line.length > bound) throw new EventTooLarge(bound);
      yield line;
    }
    if (rest === "") return;
    held.push(rest);
    heldLength += rest.length;
    if (heldLength > bound) throw new EventTooLarge(bound);
  };
}
