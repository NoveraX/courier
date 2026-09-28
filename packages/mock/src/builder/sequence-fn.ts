import type { ResolvedHandler, SequenceEntry } from "../types";

/**
 * A handler function that answers each call with the next entry of a
 * sequence, then keeps answering with the last one. An `{ error: true }`
 * entry answers with its status as an error; a `{ data, status, delay }`
 * entry answers with its status, once its delay has passed — the function
 * then returns a promise of the data.
 *
 * The entry decides the handler's status and error flag as the call runs,
 * so whoever runs the handler reads both after the call, not before.
 *
 * @param handler - The handler whose status and error flag each answer sets
 * @param responses - The answers, in order
 * @returns The handler function
 * @example
 * ```ts
 * handler.fn = sequenceFn(handler, [[alice], { error: true, status: 503 }, { data: [bob], status: 201 }]);
 * ```
 */
export function sequenceFn(
  handler: ResolvedHandler,
  responses: SequenceEntry<unknown>[],
): () => unknown {
  let index = 0;
  return () => {
    const current = responses[Math.min(index, responses.length - 1)];
    index++;

    const { data, status, isError, delay } = answerOf(current);
    handler.isError = isError;
    handler.status = status;
    if (delay <= 0) return data;
    return new Promise((resolve) => setTimeout(() => resolve(data), delay));
  };
}

interface Answer {
  data: unknown;
  status: number;
  isError: boolean;
  delay: number;
}

function answerOf(entry: SequenceEntry<unknown> | undefined): Answer {
  if (entry === null || typeof entry !== "object") {
    return { data: entry, status: 200, isError: false, delay: 0 };
  }
  if ("error" in entry && entry.error === true && "status" in entry) {
    const status = typeof entry.status === "number" ? entry.status : 500;
    const data = "data" in entry && entry.data !== undefined ? entry.data : httpFailure(status);
    return { data, status, isError: true, delay: 0 };
  }
  if ("data" in entry) {
    const status = "status" in entry && typeof entry.status === "number" ? entry.status : 200;
    const delay = "delay" in entry && typeof entry.delay === "number" ? entry.delay : 0;
    return { data: entry.data, status, isError: false, delay };
  }
  return { data: entry, status: 200, isError: false, delay: 0 };
}

function httpFailure(status: number): { success: false; message: string } {
  return { success: false, message: `HTTP ${status}` };
}
