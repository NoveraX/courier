const decoder = new TextDecoder();

/**
 * The events in one message a runtime sent: a JSON array, as UTF-8 bytes,
 * or as text where the runtime's platform has no encoder.
 *
 * @param raw - The message as Socket.IO handed it over
 * @returns The events, each still to be checked, or `undefined` when the message holds no array
 * @example
 * ```ts
 * runtimeEventsOf(Buffer.from('[{"type":"request:start","id":"r1"}]')); // [{ type: "request:start", id: "r1" }]
 * ```
 */
export function runtimeEventsOf(raw: unknown): unknown[] | undefined {
  const text =
    typeof raw === "string" ? raw : raw instanceof Uint8Array ? decoder.decode(raw) : undefined;
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Not JSON: the caller says a runtime sent what Studio cannot read. */
    return undefined;
  }
  return Array.isArray(parsed) ? parsed : undefined;
}
