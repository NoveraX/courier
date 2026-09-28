import type { SequenceEntry, SequenceStep } from "../types";

/** An entry that answers its call as an error */
type ErrorEntry = { error: true; status: number; data?: unknown };

/** An entry that wraps its data, with a status and a delay of its own */
type DataEntry = { data: unknown; status?: number; delay?: number };

/**
 * Step through a response sequence: each call takes the next entry, and the
 * last entry answers every call after it.
 *
 * Each entry becomes the whole answer of the one call that takes it — its
 * data, its status, whether it is an error, and its delay. The registry takes
 * the step as it resolves the call, before the call is delayed, so a call's
 * delay and status are its own entry's and never another call's.
 *
 * @param responses - The answers, in order
 * @returns A function that gives the next call its answer
 * @example
 * ```ts
 * const next = sequenceSteps([{ data: [], delay: 300 }, { error: true, status: 503 }]);
 * next(); // { data: [], isError: false, status: undefined, delayMs: 300 }
 * next(); // { data: { success: false, message: "HTTP 503" }, isError: true, status: 503 }
 * next(); // the 503 again
 * ```
 */
export function sequenceSteps(responses: readonly SequenceEntry<unknown>[]): () => SequenceStep {
  let index = 0;
  return () => {
    const entry = responses[Math.min(index, responses.length - 1)];
    index++;
    return stepOf(entry);
  };
}

function stepOf(entry: SequenceEntry<unknown> | undefined): SequenceStep {
  if (isErrorEntry(entry)) {
    const data = entry.data ?? { success: false, message: `HTTP ${entry.status}` };
    return { data, isError: true, status: entry.status };
  }
  if (isDataEntry(entry)) {
    return { data: entry.data, isError: false, status: entry.status, delayMs: entry.delay };
  }
  return { data: entry, isError: false };
}

function isErrorEntry(entry: unknown): entry is ErrorEntry {
  return typeof entry === "object" && entry !== null && "error" in entry && entry.error === true;
}

function isDataEntry(entry: unknown): entry is DataEntry {
  return typeof entry === "object" && entry !== null && "data" in entry;
}
