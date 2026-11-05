/** The most bytes a WebSocket close frame carries as its reason (RFC 6455, 5.5). */
const MAX_REASON_BYTES = 123;

const encoder = new TextEncoder();

/**
 * A close reason a WebSocket can send: at most 123 bytes of UTF-8, cut at a
 * character, never through one. A longer reason makes the socket's
 * `close()` throw, and a cut through a character sends a frame the peer
 * fails the connection on.
 *
 * @param text - The reason as the server would say it
 * @returns The reason, cut to fit
 * @example
 * ```ts
 * ws.close(4401, closeReason(error.message));
 * ```
 */
export function closeReason(text: string): string {
  if (encoder.encode(text).length <= MAX_REASON_BYTES) return text;
  let kept = "";
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > MAX_REASON_BYTES - 3) break;
    kept += character;
    bytes += size;
  }
  return `${kept}…`;
}
