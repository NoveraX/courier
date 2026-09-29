import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types-request";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

const SUBSCRIBE_TIMEOUT_MS = 5_000;

interface MatchPayload {
  source: string;
  group: string;
  method: string;
}

/**
 * Subscribe to store and copy timing + headers when the runtime reports the
 * request the Playground ran. The runtime runs it in-process whichever mode
 * the Playground is in, so it is reported as a direct request; looking for a
 * proxy request found none, and the Timing tab stayed empty.
 */
export function subscribeForRunData(
  playgroundId: string,
  payload: MatchPayload,
  sentAt: number,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
): void {
  let done = false;

  const cleanup = () => {
    if (done) return;
    done = true;
    unsub();
    clearTimeout(timeout);
  };

  const unsub = useStudioStore.subscribe((state) => {
    const match = findMatchingRequest(state.requests, payload, sentAt);
    if (!match?.timing) return;

    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  });

  const timeout = setTimeout(cleanup, SUBSCRIBE_TIMEOUT_MS);

  // Check immediately — data may already be in store
  const match = findMatchingRequest(useStudioStore.getState().requests, payload, sentAt);
  if (match?.timing) {
    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  }
}

function findMatchingRequest(
  requests: RequestEntry[],
  payload: MatchPayload,
  sentAt: number,
): RequestEntry | undefined {
  return requests.find(
    (r) =>
      r.source.toLowerCase() === payload.source.toLowerCase() &&
      r.group === payload.group &&
      r.method === payload.method &&
      r.startedAt >= sentAt - 1000,
  );
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
