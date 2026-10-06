import { describedUploads } from "../described-uploads";
import type { MockHistoryEntry } from "../types";

/** A history entry as the admin API sends it, its error reduced to name and message */
export type HistoryEntryJson = Omit<MockHistoryEntry, "error"> & {
  error?: { name: string; message: string };
};

/**
 * A history entry in a form JSON keeps. An `Error` has no enumerable
 * properties, so `JSON.stringify` writes it as `{}` and the reason a request
 * failed is lost; the entry's error is sent as its name and message instead.
 * A file it sent is a `{}` too, and is sent as its name, type and size.
 *
 * @param entry - An entry of the mock server's request history
 * @returns The same entry, ready to be sent as JSON
 * @example
 * ```ts
 * c.json(history.slice(-limit).map(historyEntryJson));
 * ```
 */
export function historyEntryJson(entry: MockHistoryEntry): HistoryEntryJson {
  const { error, variables, ...rest } = entry;
  const shown = { ...rest, variables: describedUploads(variables) };
  if (!error) return shown;
  return { ...shown, error: { name: error.name, message: error.message } };
}
