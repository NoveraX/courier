import type { SSEEvent } from "../types";
import { readSSELines } from "./sse-lines";

/** Raw parsed SSE event with string data (before JSON parsing) */
export type RawSSEEvent = SSEEvent<string>;

/** What one block of an event stream said, up to the blank line that ends it. */
export interface SSEFrame {
  /** The event it dispatches; absent when it sent no `data`. */
  readonly event?: RawSSEEvent;
  /** The last event ID it set; an empty one resets it. */
  readonly id?: string;
  /** The reconnection time it set, in milliseconds. */
  readonly retry?: number;
}

const WHOLE_NUMBER = /^\d+$/;

/**
 * Parse a ReadableStream of bytes into the blocks of an event stream, as the
 * HTML standard interprets one.
 *
 * Lines end at a CRLF, a lone LF or a lone CR, in any mix; a blank line ends
 * a block. A block dispatches an event only when it sent `data`, but one that
 * sets only an `id` or a `retry` still says so, since both change how a
 * client reconnects. A block the stream ends in the middle of is discarded,
 * its `id` too: the event it began may have lost part of its data.
 *
 * @param stream - Response body from fetch
 * @returns The blocks, in order; a heartbeat is a block that says nothing
 * @example
 * ```ts
 * for await (const frame of parseSSEFrames(response.body)) {
 *   if (frame.id !== undefined) lastEventId = frame.id;
 *   if (frame.event) handle(frame.event);
 * }
 * ```
 */
export async function* parseSSEFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEFrame, void, unknown> {
  let block = createBlock();
  for await (const line of readSSELines(stream)) {
    if (line !== "") {
      block.take(line);
      continue;
    }
    if (block.said) yield block.frame();
    block = createBlock();
  }
}

/**
 * Parse a ReadableStream of bytes into SSE events per the HTML standard.
 * Handles multi-line data, all line endings (LF/CRLF/CR), comments, and chunked reads.
 *
 * Yields `null` for a block that dispatches no event — a heartbeat comment,
 * or one that only sets `id` or `retry` — so callers can reset timers.
 *
 * @param stream - Response body from fetch (ReadableStream<Uint8Array>)
 * @returns Async generator yielding RawSSEEvent or null
 * @example
 * ```ts
 * for await (const event of parseSSEStream(response.body)) {
 *   if (event) console.log(event.data);
 * }
 * ```
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSSEEvent | null, void, unknown> {
  for await (const frame of parseSSEFrames(stream)) yield frame.event ?? null;
}

/** The fields of the block being read. */
function createBlock() {
  let data: string[] | undefined;
  let type = "";
  let id: string | undefined;
  let retry: number | undefined;
  let said = false;

  return {
    /** Whether the block has any line at all, a comment included. */
    get said() {
      return said;
    },
    take(line: string): void {
      said = true;
      if (line.startsWith(":")) return;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "data") {
        data ??= [];
        data.push(value);
      } else if (field === "event") type = value;
      else if (field === "id" && !value.includes("\u0000")) id = value;
      else if (field === "retry" && WHOLE_NUMBER.test(value)) retry = Number(value);
    },
    frame(): SSEFrame {
      const event: RawSSEEvent | undefined = data && {
        data: data.join("\n"),
        ...(id !== undefined && { id }),
        ...(type !== "" && { event: type }),
        ...(retry !== undefined && { retry }),
      };
      return {
        ...(event && { event }),
        ...(id !== undefined && { id }),
        ...(retry !== undefined && { retry }),
      };
    },
  };
}
