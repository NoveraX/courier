import { useState, useCallback } from "react";

import { getSocket } from "@/socket";
import { useDevToolsStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { RequestTiming } from "@/store/types-events";
import type { RequestEntry } from "@/store/types-request";
import { stripComments } from "./json-editor";

const TIMEOUT_MS = 30_000;
const SUBSCRIBE_TIMEOUT_MS = 5_000;

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
  requestHeaders?: Record<string, string>;
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
        requestHeaders: res.requestHeaders,
        timing: res.timing,
      });

      // For proxy mode: timing arrives via devtools event pipeline
      // (request:end → socket → store.requests), not the playground callback.
      // Subscribe to store changes instead of polling.
      if (payload.mode === "proxy" && !res.timing) {
        subscribeForProxyData(id, payload, sentAt, updateEntry);
      }
    });

    return id;
  }, [addEntry, updateEntry]);

  return { send, sending };
}

/** Subscribe to store and copy timing + headers when matching request appears */
function subscribeForProxyData(
  playgroundId: string,
  payload: SendPayload,
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

  const unsub = useDevToolsStore.subscribe((state) => {
    const match = findMatchingRequest(state.requests, payload, sentAt);
    if (!match?.timing) return;

    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  });

  const timeout = setTimeout(cleanup, SUBSCRIBE_TIMEOUT_MS);

  // Check immediately — data may already be in store
  const match = findMatchingRequest(
    useDevToolsStore.getState().requests,
    payload,
    sentAt,
  );
  if (match?.timing) {
    cleanup();
    applyProxyData(playgroundId, match, updateEntry);
  }
}

function findMatchingRequest(
  requests: RequestEntry[],
  payload: SendPayload,
  sentAt: number,
): RequestEntry | undefined {
  return requests.find((r) =>
    r.source.toLowerCase() === payload.source.toLowerCase() &&
    r.group === payload.group &&
    r.method === payload.method &&
    r.mode === "proxy" &&
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
