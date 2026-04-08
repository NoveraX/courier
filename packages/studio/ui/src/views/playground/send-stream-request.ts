/**
 * Realtime stream (SSE / WS) dispatch for the playground.
 *
 * Extracted from `use-send-request.ts` so the React hook is freed of socket
 * orchestration. Handles the connect handshake, the unmount-during-handshake
 * race (cancels the server-side stream), and links the playground entry to
 * the server request id used by the StreamEventsTab.
 */

import { getSocket } from "@/socket";
import { cancelServerStream, safeParse } from "./playground-utils";
import { subscribeToStream } from "./stream-subscription";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { SendPayload } from "./send-http-request";

type UpdateEntry = (id: string, patch: Partial<PlaygroundHistoryEntry>) => void;

export interface StreamHandle {
  requestId: string;
  unsub: () => void;
}

interface InitiateStreamParams {
  playgroundId: string;
  payload: SendPayload;
  updateEntry: UpdateEntry;
  setStreaming: (streaming: boolean) => void;
  unmountedRef: React.MutableRefObject<boolean>;
  streamRef: React.MutableRefObject<StreamHandle | null>;
}

/**
 * Open a realtime stream for the playground entry. Returns nothing — the
 * caller observes progress via the entry updater and `setStreaming`.
 */
export function initiateStreamRequest({
  playgroundId,
  payload,
  updateEntry,
  setStreaming,
  unmountedRef,
  streamRef,
}: InitiateStreamParams): void {
  // Save user-provided headers on the playground entry
  const parsedHeaders = safeParse<Record<string, string>>(payload.headers, {});
  if (parsedHeaders && Object.keys(parsedHeaders).length > 0) {
    updateEntry(playgroundId, { requestHeaders: parsedHeaders });
  }

  getSocket().emit("playground:stream", {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables: safeParse(payload.variables, undefined),
    headers: parsedHeaders,
    transport: payload.transport,
    mode: payload.mode,
  }, (res: { requestId: string; error?: string } | null) => {
    if (!res || res.error || !res.requestId) {
      updateEntry(playgroundId, {
        status: "error",
        streamStatus: "error",
        response: res?.error ?? "Connection lost",
      });
      if (!unmountedRef.current) setStreaming(false);
      return;
    }

    // Component unmounted while waiting for callback — cancel immediately
    if (unmountedRef.current) {
      cancelServerStream(res.requestId);
      return;
    }

    // Link playground entry to server request for StreamEventsTab
    updateEntry(playgroundId, { serverRequestId: res.requestId });

    const unsub = subscribeToStream(playgroundId, res.requestId, updateEntry, () => {
      if (!unmountedRef.current) setStreaming(false);
      streamRef.current = null;
    });

    streamRef.current = { requestId: res.requestId, unsub };
  });
}
