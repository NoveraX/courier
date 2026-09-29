import { useCallback, useEffect, useRef, useState } from "react";

import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

import { cancelServerStream } from "./playground-utils";
import type { RequestValues } from "./request-values";
import { initiateHttpRequest, type SendPayload } from "./send-http-request";
import { initiateStreamRequest } from "./send-stream-request";

export type { SendPayload };

/**
 * React hook driving playground request dispatch over the rid-keyed wire.
 *
 * Every entry carries its own `rid` (generated here as a UUID) that the
 * `playground:exec` emit and the matching `playground:chunk` /
 * `playground:end` / `playground:error` listeners use to route response
 * state back through the store reducers. The hook itself holds no stream
 * state — `sending` and `streaming` flags are cosmetic gates for the
 * toolbar spinner / unsubscribe button and are cleared by watching the
 * store's active entry transitions.
 *
 * While a stream is live nothing else is sent: its rid is the one
 * Unsubscribe closes, and a second request would take that place and leave
 * the stream running with nothing left to close it.
 */
export function useSendRequest() {
  const addEntry = useStudioStore((s) => s.addPlaygroundEntry);
  const updateEntry = useStudioStore((s) => s.updatePlaygroundEntry);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const activeRidRef = useRef<string | null>(null);

  // Cleanup on unmount — cancel the active stream on the server so the
  // runtime responder drops its in-flight channel / subscription. The
  // terminal event still flows back through the router's `inFlight` map,
  // which keys on rid not hook instance.
  useEffect(() => {
    return () => {
      if (!activeRidRef.current) return;
      cancelServerStream(activeRidRef.current);
      activeRidRef.current = null;
    };
  }, []);

  // Flip `streaming` off when the active entry reaches a terminal state.
  // Watching `playgroundActiveResponse` keeps the subscription cheap and
  // lets the reducers (`endPlayground` / `errorPlayground`) remain the
  // single source of truth for lifecycle transitions.
  useEffect(() => {
    return useStudioStore.subscribe((state) => {
      const rid = activeRidRef.current;
      if (!rid) return;
      const entry = state.playgroundActiveResponse;
      if (!entry || entry.rid !== rid) return;
      if (entry.streamStatus === "complete" || entry.streamStatus === "error") {
        activeRidRef.current = null;
        setStreaming(false);
      }
    });
  }, []);

  const send = useCallback(
    (payload: SendPayload, values: RequestValues): string | null => {
      if (activeRidRef.current) return null;
      const id = crypto.randomUUID();
      const rid = id;
      const sentAt = Date.now();
      const isRealtime = payload.transport === "sse" || payload.transport === "ws";

      const entry: PlaygroundHistoryEntry = {
        id,
        rid,
        ...payload,
        timestamp: sentAt,
        status: "pending",
        /* The headers go out as written: the wire does not echo them back. */
        ...(Object.keys(values.headers).length > 0 && { requestHeaders: values.headers }),
        ...(isRealtime && {
          transport: payload.transport,
          streamStatus: "connecting" as const,
        }),
      };

      addEntry(entry);
      setSending(true);

      if (isRealtime) {
        setSending(false);
        setStreaming(true);
        activeRidRef.current = rid;
        initiateStreamRequest({ rid, payload, values });
      } else {
        initiateHttpRequest({ id, rid, payload, values, sentAt, updateEntry, setSending });
      }

      return id;
    },
    [addEntry, updateEntry],
  );

  const unsubscribe = useCallback(() => {
    const rid = activeRidRef.current;
    if (!rid) return;
    activeRidRef.current = null;
    setStreaming(false);
    cancelServerStream(rid);
    // The runtime responder answers the cancel with its own terminal
    // event — `playground:end` on clean abort, `playground:error` on
    // forced close — which drives `streamStatus` through the store
    // reducers. We finalize the entry here only when the cancel can't
    // reach a runtime (e.g. orphaned rid on a cleared history); the
    // `updatePlaygroundEntry` call is idempotent either way.
    const entry = useStudioStore.getState().playgroundHistory.find((e) => e.rid === rid);
    if (entry && entry.streamStatus !== "complete" && entry.streamStatus !== "error") {
      useStudioStore
        .getState()
        .updatePlaygroundEntry(entry.id, { status: "success", streamStatus: "complete" });
    }
  }, []);

  return { send, sending, streaming, unsubscribe };
}
