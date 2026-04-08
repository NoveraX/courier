/**
 * Subscribe to store for stream state changes by server-assigned requestId.
 * Single source of truth: reads from RequestEntry in global store.
 */

import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { RequestEntry } from "@/store/types-request";

/** Subscribe to a specific stream by requestId, sync state to playground entry */
export function subscribeToStream(
  playgroundId: string,
  serverRequestId: string,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
  onDone: () => void,
): () => void {
  let done = false;
  let lastSnapshot = "";

  const unsub = useStudioStore.subscribe((state) => {
    if (done) return;
    const match = state.requests.find((r) => r.id === serverRequestId);
    if (!match) return;

    // Skip if nothing changed — prevents infinite loop
    // (updateEntry triggers store update → re-triggers this subscriber)
    const snapshot = snapshotKey(match);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;

    syncPlaygroundEntry(playgroundId, match, updateEntry);

    if (match.streamStatus === "complete" || match.streamStatus === "error") {
      cleanup();
    }
  });

  const cleanup = () => {
    if (done) return;
    done = true;
    unsub();
    onDone();
  };

  // Immediate check — event may have arrived before subscription
  const current = useStudioStore.getState().requests.find((r) => r.id === serverRequestId);
  if (current) {
    lastSnapshot = snapshotKey(current);
    syncPlaygroundEntry(playgroundId, current, updateEntry);
  }

  return cleanup;
}

function snapshotKey(r: RequestEntry): string {
  return `${r.streamStatus}:${r.streamEventCount}:${r.streamTotalBytes}:${r.streamDuration}`;
}

function syncPlaygroundEntry(
  playgroundId: string,
  match: RequestEntry,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
): void {
  updateEntry(playgroundId, {
    status: match.streamStatus === "error" ? "error"
      : match.streamStatus === "complete" ? "success"
      : "pending",
    streamStatus: match.streamStatus as PlaygroundHistoryEntry["streamStatus"],
    streamEventCount: match.streamEventCount,
    streamTotalBytes: match.streamTotalBytes,
    duration: match.streamDuration,
  });
}
