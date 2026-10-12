const decoder = new TextDecoder();

/**
 * The events of a replay Studio sends: the JSON array its database keeps,
 * in UTF-8. Studio sends the text as it keeps it rather than reading each
 * event and writing it out again, which for a full log of a large project
 * took a page that connected a tenth of a second and more.
 *
 * @param data - The replay as the socket handed it over: bytes in a page, a `Buffer` in Node
 * @returns The events, each still to be checked; `undefined` for anything but a JSON array, which the page passes over
 * @example
 * ```ts
 * const events = replayedEvents(data);
 * if (events) store().replayEvents(events.filter(isStudioEvent));
 * ```
 */
export function replayedEvents(data: unknown): unknown[] | undefined {
  const bytes = bytesOf(data);
  if (bytes === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(decoder.decode(bytes));
    return Array.isArray(parsed) ? parsed : undefined;
  } catch (error) {
    console.warn("Studio sent a replay this page could not read", error);
    return undefined;
  }
}

/* Read by what the value is, not by its constructor: a socket in a test hands over another realm's. */
function bytesOf(data: unknown): Uint8Array | null {
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return isArrayBuffer(data) ? new Uint8Array(data) : null;
}

function isArrayBuffer(data: unknown): data is ArrayBuffer {
  return Object.prototype.toString.call(data) === "[object ArrayBuffer]";
}
