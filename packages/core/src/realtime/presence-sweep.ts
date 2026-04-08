import type { PresenceEntry } from "./adapters";

/**
 * Remove stale entries from a topic map based on lastSeenAt threshold.
 * Pure function — mutates the provided map in-place.
 *
 * @param entries - Map of connectionId → PresenceEntry
 * @param staleThresholdMs - Entries older than this are removed
 * @returns Array of removed entries (for diff broadcast)
 */
export function sweepStaleEntries(
  entries: Map<string, PresenceEntry>,
  staleThresholdMs: number,
): PresenceEntry[] {
  const now = Date.now();
  const swept: PresenceEntry[] = [];
  for (const [connId, entry] of entries) {
    if (now - entry.lastSeenAt > staleThresholdMs) {
      entries.delete(connId);
      swept.push(entry);
    }
  }
  return swept;
}
