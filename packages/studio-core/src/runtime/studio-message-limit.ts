/** Room left for the packet around a message: its event name, its acknowledgement id. */
const ENVELOPE_BYTES = 1024;

/**
 * The largest message Studio takes from this runtime, as Studio said when
 * the runtime said hello. A larger one closes the runtime's connection, so
 * the runtime sends a short refusal in its place. Unknown — Studio said
 * nothing — none is refused.
 */
export interface StudioMessageLimit {
  /**
   * Why a message is too large to send Studio, or `null` when it fits.
   *
   * @param what - What the message holds, for the refusal: "This answer", say
   * @param payload - The message, as it would be sent
   */
  refusal(what: string, payload: unknown): string | null;
  /** Take what Studio said when the runtime said hello. */
  welcome(said: unknown): void;
}

/**
 * Studio's limit on the messages this runtime sends it, unknown until
 * Studio says it in answer to `runtime:hello`.
 *
 * @returns The limit, and how to learn it
 * @example
 * ```ts
 * const limit = studioMessageLimit();
 * socket.emit("runtime:hello", hello, limit.welcome);
 * const refusal = limit.refusal("This body", answer);
 * ```
 */
export function studioMessageLimit(): StudioMessageLimit {
  let max = Number.POSITIVE_INFINITY;
  return {
    welcome(said) {
      const told: unknown =
        typeof said === "object" && said !== null
          ? Reflect.get(said, "maxMessageBytes")
          : undefined;
      if (typeof told === "number" && told > ENVELOPE_BYTES) max = told - ENVELOPE_BYTES;
    },
    refusal(what, payload) {
      if (!Number.isFinite(max)) return null;
      const size = jsonBytes(payload, max);
      if (size <= max) return null;
      return `${what} is ${megabytes(size)}, more than Studio takes from an app in one message (${megabytes(max + ENVELOPE_BYTES)}). Read it where the app runs.`;
    },
  };
}

/* A string of n characters is at most 3n bytes as UTF-8: one that short surely fits. */
function jsonBytes(payload: unknown, max: number): number {
  const text = JSON.stringify(payload) ?? "";
  if (text.length * 3 <= max) return text.length;
  return new TextEncoder().encode(text).length;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
