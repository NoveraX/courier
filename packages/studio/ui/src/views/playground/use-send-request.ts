import { useCallback, useEffect, useRef, useState } from "react";

import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

import { cancelServerStream } from "./playground-utils";
import { initiateHttpRequest, type SendPayload } from "./send-http-request";
import { initiateStreamRequest, type StreamHandle } from "./send-stream-request";

export type { SendPayload };

export function useSendRequest() {
  const addEntry = useStudioStore((s) => s.addPlaygroundEntry);
  const updateEntry = useStudioStore((s) => s.updatePlaygroundEntry);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<StreamHandle | null>(null);
  const unmountedRef = useRef(false);

  // Cleanup on unmount — cancel active stream on server
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (!streamRef.current) return;
      const { requestId, unsub } = streamRef.current;
      streamRef.current = null;
      unsub();
      cancelServerStream(requestId);

      // Mark playground entry as complete (subscription already unsubscribed)
      const entry = useStudioStore.getState().playgroundHistory.find(
        (e) => e.serverRequestId === requestId,
      );
      if (entry && entry.streamStatus !== "complete" && entry.streamStatus !== "error") {
        useStudioStore.getState().updatePlaygroundEntry(entry.id, {
          status: "success",
          streamStatus: "complete",
        });
      }
    };
  }, []);

  const send = useCallback((payload: SendPayload): string => {
    const id = crypto.randomUUID();
    const sentAt = Date.now();
    const isRealtime = payload.transport === "sse" || payload.transport === "ws";

    const entry: PlaygroundHistoryEntry = {
      id,
      ...payload,
      timestamp: sentAt,
      status: "pending",
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
      initiateStreamRequest({
        playgroundId: id,
        payload,
        updateEntry,
        setStreaming,
        unmountedRef,
        streamRef,
      });
    } else {
      initiateHttpRequest({ id, payload, sentAt, updateEntry, setSending });
    }

    return id;
  }, [addEntry, updateEntry]);

  const unsubscribe = useCallback(() => {
    if (!streamRef.current) return;
    const { requestId, unsub } = streamRef.current;
    unsub();
    setStreaming(false);
    streamRef.current = null;
    cancelServerStream(requestId);

    // Mark the playground entry as complete
    const entry = useStudioStore.getState().playgroundHistory.find(
      (e) => e.serverRequestId === requestId,
    );
    if (entry) {
      updateEntry(entry.id, { status: "success", streamStatus: "complete" });
    }
  }, [updateEntry]);

  return { send, sending, streaming, unsubscribe };
}
