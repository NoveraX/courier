import type { ResolvedHandler, SequenceEntry } from "../types";

/**
 * A handler function that answers each call with the next entry of a
 * sequence, then keeps answering with the last one. An `{ error: true }`
 * entry answers with its status as an error.
 *
 * @param handler - The handler whose status and error flag each answer sets
 * @param responses - The answers, in order
 * @returns The handler function
 */
export function sequenceFn(
  handler: ResolvedHandler,
  responses: SequenceEntry<unknown>[],
): () => unknown {
  let index = 0;
  return () => {
    const current: SequenceEntry<unknown> =
      index < responses.length ? responses[index] : responses[responses.length - 1];
    index++;

    if (!current) return undefined;

    if (typeof current === "object" && current !== null) {
      if ("error" in current && current.error === true) {
        const entry = current as { error: true; status: number; data?: unknown };
        // Answered as an error with the entry's status
        handler.isError = true;
        handler.status = entry.status;
        return entry.data ?? { success: false, message: `HTTP ${entry.status}` };
      }
      if ("data" in current) {
        handler.isError = false;
        handler.status = 200;
        return (current as { data: unknown }).data;
      }
    }

    handler.isError = false;
    handler.status = 200;
    return current;
  };
}
