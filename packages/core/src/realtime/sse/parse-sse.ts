import type { SSEEvent } from "../types";

/** Raw parsed SSE event with string data (before JSON parsing) */
export type RawSSEEvent = SSEEvent<string>;

/** Cached regex patterns for SSE parsing — avoids re-compilation on every chunk */
const EVENT_DELIMITER = /\n\n|\r\n\r\n|\r\r/;
const LINE_DELIMITER = /\n|\r\n|\r/;

/**
 * Parse a ReadableStream of bytes into SSE events per the HTML5 spec.
 * Handles multi-line data, all line endings (LF/CRLF/CR), comments, and chunked reads.
 *
 * Yields `null` for comment-only events (heartbeats) so callers can reset timers.
 *
 * @param stream - Response body from fetch (ReadableStream<Uint8Array>)
 * @returns Async generator yielding RawSSEEvent or null (comment/heartbeat)
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSSEEvent | null, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(EVENT_DELIMITER);
      // Last element is incomplete — keep in buffer
      buffer = events.pop() ?? "";

      for (const block of events) {
        const event = parseEventBlock(block);
        yield event;
      }
    }

    // Flush remaining buffer (server closed without trailing newline)
    if (buffer.trim()) {
      yield parseEventBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

/** Parse a single event block (text between double newlines) into RawSSEEvent or null */
function parseEventBlock(block: string): RawSSEEvent | null {
  const lines = block.split(LINE_DELIMITER);
  let data: string[] | undefined;
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  let hasContent = false;

  for (const line of lines) {
    if (line.startsWith(":")) continue; // Comment — skip

    const colonIdx = line.indexOf(":");
    const [field, value] =
      colonIdx === -1
        ? [line, ""]
        : [line.slice(0, colonIdx), line.slice(colonIdx + 1).replace(/^ /, "")];

    switch (field) {
      case "data":
        if (!data) data = [];
        data.push(value);
        hasContent = true;
        break;
      case "id":
        id = value;
        hasContent = true;
        break;
      case "event":
        event = value;
        hasContent = true;
        break;
      case "retry": {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) retry = parsed;
        hasContent = true;
        break;
      }
    }
  }

  // Comment-only block → null (for heartbeat reset)
  if (!hasContent) return null;

  return {
    data: data?.join("\n") ?? "",
    ...(id !== undefined && { id }),
    ...(event !== undefined && { event }),
    ...(retry !== undefined && { retry }),
  };
}
