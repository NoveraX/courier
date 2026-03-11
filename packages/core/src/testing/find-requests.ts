import type { HistoryEntry } from "./types";

/** Filter history entries by group and optionally by method */
export function findRequests(
  history: HistoryEntry[],
  group: string,
  method?: string,
): HistoryEntry[] {
  return history.filter((e) => e.group === group && (method === undefined || e.method === method));
}
