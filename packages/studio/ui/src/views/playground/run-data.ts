import { playgroundRequestId } from "@noverax/courier-studio-core";

import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types-request";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

const SUBSCRIBE_TIMEOUT_MS = 5_000;

/**
 * Copy the timing and headers of the request a Playground run made, once the
 * runtime reports it, onto the run's entry.
 *
 * The runtime runs the call under `playgroundRequestId(rid)`, so the request
 * is found by that id alone: any other call the app makes to the endpoint is
 * none of the run's, and a run that failed before it sent anything has no
 * request to take a status from.
 *
 * @param playgroundId - The run's history entry
 * @param rid - The run's id
 * @param updateEntry - Patches the entry
 * @example
 * ```ts
 * subscribeForRunData(entry.id, rid, updatePlaygroundEntry);
 * ```
 */
export function subscribeForRunData(
  playgroundId: string,
  rid: string,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
): void {
  const requestId = playgroundRequestId(rid);
  let done = false;

  const cleanup = () => {
    if (done) return;
    done = true;
    unsub();
    clearTimeout(timeout);
  };

  const unsub = useStudioStore.subscribe((state) => {
    const match = state.requests.find((r) => r.id === requestId);
    if (!match?.timing) return;

    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  });

  const timeout = setTimeout(cleanup, SUBSCRIBE_TIMEOUT_MS);

  const match = useStudioStore.getState().requests.find((r) => r.id === requestId);
  if (match?.timing) {
    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  }
}

function applyProxyData(
  playgroundId: string,
  match: RequestEntry,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
): void {
  const patch: Partial<PlaygroundHistoryEntry> = { timing: match.timing };
  if (match.proxyTiming) patch.proxyTiming = match.proxyTiming;
  if (match.statusCode) patch.statusCode = match.statusCode;
  if (match.headers && Object.keys(match.headers).length > 0) {
    patch.responseHeaders = match.headers;
  }
  if (match.requestHeaders && Object.keys(match.requestHeaders).length > 0) {
    patch.requestHeaders = match.requestHeaders;
  }
  updateEntry(playgroundId, patch);
}
