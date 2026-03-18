import { useState, useCallback } from "react";

import { getSocket } from "@/socket";
import { useDevToolsStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { RequestTiming } from "@/store/types-events";
import { stripComments } from "./json-editor";

const TIMEOUT_MS = 30_000;
const TIMING_POLL_MS = 300;

interface SendPayload {
  source: string;
  group: string;
  method: string;
  variables: string;
  headers: string;
  mode: "direct" | "proxy";
}

interface SocketResponse {
  status?: number;
  data?: unknown;
  error?: string;
  headers?: Record<string, string>;
  duration?: number;
  timing?: RequestTiming;
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(stripComments(json)) as T; } catch { return fallback; }
}

export function useSendRequest() {
  const addEntry = useDevToolsStore((s) => s.addPlaygroundEntry);
  const updateEntry = useDevToolsStore((s) => s.updatePlaygroundEntry);
  const [sending, setSending] = useState(false);

  const send = useCallback((payload: SendPayload): string => {
    const id = crypto.randomUUID();
    const sentAt = Date.now();
    const entry: PlaygroundHistoryEntry = {
      id,
      ...payload,
      timestamp: sentAt,
      status: "pending",
    };

    addEntry(entry);
    setSending(true);

    const timeout = setTimeout(() => {
      updateEntry(id, { status: "error", response: "Request timed out (30s)" });
      setSending(false);
    }, TIMEOUT_MS);

    getSocket().emit("playground:send", {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      variables: safeParse(payload.variables, undefined),
      headers: safeParse<Record<string, string>>(payload.headers, {}),
      mode: payload.mode,
    }, (res: SocketResponse) => {
      clearTimeout(timeout);
      setSending(false);

      updateEntry(id, {
        status: res.error ? "error" : "success",
        statusCode: res.status,
        duration: res.duration,
        response: res.error ?? res.data,
        responseHeaders: res.headers,
        timing: res.timing,
      });

      // For proxy mode: timing comes through devtools events pipeline
      // (request:end on server → socket → UI store.requests), not through
      // the playground callback. Poll store for matching request with full timing.
      if (payload.mode === "proxy" && !res.timing) {
        pollForProxyData(id, payload, sentAt, updateEntry);
      }
    });

    return id;
  }, [addEntry, updateEntry]);

  return { send, sending };
}

/** Find matching RequestEntry in store and copy timing + headers to playground entry */
function pollForProxyData(
  playgroundId: string,
  payload: SendPayload,
  sentAt: number,
  updateEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void,
): void {
  let attempts = 0;
  const poll = () => {
    attempts++;
    const requests = useDevToolsStore.getState().requests;
    const match = requests.find((r) =>
      r.source.toLowerCase() === payload.source.toLowerCase() &&
      r.group === payload.group &&
      r.method === payload.method &&
      r.mode === "proxy" &&
      r.startedAt >= sentAt - 1000,
    );

    if (match?.timing) {
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
    } else if (attempts < 5) {
      setTimeout(poll, TIMING_POLL_MS);
    }
  };
  setTimeout(poll, TIMING_POLL_MS);
}
