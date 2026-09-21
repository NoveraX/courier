/**
 * Test seams for the announcement buffer.
 *
 * Deliberately not reachable from `@noverax/courier/announce`: emptying the
 * buffer or counting it is meaningless to an application, and an underscore
 * prefix is a convention a published entry point does not enforce. The state
 * is pinned to a `globalThis` symbol, so this module reaches the same buffer
 * the producer writes to without either importing the other.
 */

interface AnnounceState {
  buffer: unknown[];
  listeners: Set<unknown>;
}

const ANNOUNCE_STATE_KEY = Symbol.for("courier.runtime.announce-state");

function state(): AnnounceState | undefined {
  return (globalThis as Record<symbol, unknown>)[ANNOUNCE_STATE_KEY] as AnnounceState | undefined;
}

/** Drop every buffered announcement and listener. */
export function resetAnnouncements(): void {
  const current = state();
  if (!current) return;
  current.buffer.length = 0;
  current.listeners.clear();
}

/** How many announcements are waiting to be drained. */
export function bufferedAnnouncementCount(): number {
  return state()?.buffer.length ?? 0;
}
