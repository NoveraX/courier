/**
 * Read an event's data from a stream another server serves: JSON when it
 * is JSON, and the text as it came otherwise. The SSE format carries text;
 * a third party's `plain text` or OpenAI's closing `[DONE]` is data too, and
 * was skipped as unparsable.
 *
 * A Courier server writes every event's data as JSON, so its streams keep
 * the strict parse, where data that is not JSON means a broken stream.
 *
 * @param raw - The event's data, as the stream carried it
 * @returns The value it holds as JSON, or the text
 * @example
 * ```ts
 * readStreamData('{"n":1}'); // → { n: 1 }
 * readStreamData("[DONE]"); // → "[DONE]"
 * ```
 */
export function readStreamData(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
