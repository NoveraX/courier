import type { PlaygroundHistoryEntry } from "@/store/types-ui";

/**
 * What a run becomes when the Playground cancels it before its answer came:
 * cancelled, which is final — an answer the runtime sends after it changes
 * nothing — and as long as it ran until then.
 *
 * @param entry - The run in flight
 * @param now - The time of the cancel, in ms since the epoch
 * @returns The change to the run
 * @example
 * ```ts
 * updateEntry(entry.id, cancelledRun(entry, Date.now()));
 * ```
 */
export function cancelledRun(
  entry: PlaygroundHistoryEntry,
  now: number,
): Partial<PlaygroundHistoryEntry> {
  return { status: "cancelled", duration: Math.max(0, now - entry.timestamp), upload: undefined };
}
