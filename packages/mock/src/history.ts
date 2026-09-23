import type { MockHistoryEntry } from "./types";

/** How many requests a history keeps unless told otherwise */
export const DEFAULT_HISTORY_LIMIT = 1000;

/**
 * A request history that keeps the most recent `limit` entries.
 *
 * It is a plain array — `server.history` reads as one — whose `push` drops
 * the oldest entries once it holds a quarter more than the limit, so each
 * push costs the same on average. It used to keep every request, with its
 * variables and response data, for as long as the process ran: a working
 * day at a few requests a second held well over 100 MB.
 *
 * @param limit - Entries to keep (default 1000)
 * @returns An empty, bounded history
 * @example
 * const history = createHistory(500);
 * history.push(entry);
 */
export function createHistory(limit: number = DEFAULT_HISTORY_LIMIT): MockHistoryEntry[] {
  const history: MockHistoryEntry[] = [];
  const slack = Math.max(1, Math.ceil(limit / 4));
  Object.defineProperty(history, "push", {
    value(...entries: MockHistoryEntry[]): number {
      const length = Array.prototype.push.apply(history, entries);
      if (length > limit + slack) history.splice(0, length - limit);
      return history.length;
    },
    writable: true,
    configurable: true,
  });
  return history;
}
