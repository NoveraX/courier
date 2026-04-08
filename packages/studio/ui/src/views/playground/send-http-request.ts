/**
 * One-shot HTTP request dispatch for the playground.
 *
 * Purely imperative — pushes a request over the studio socket, attaches a
 * 30s safety timeout, and folds the server response back into the
 * playground entry via the supplied updater.
 */

import { getSocket } from "@/socket";
import { safeParse } from "./playground-utils";
import { subscribeForProxyData } from "./proxy-data";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { RequestTiming } from "@/store/types-events";

const TIMEOUT_MS = 30_000;

export interface SendPayload {
  source: string;
  group: string;
  method: string;
  variables: string;
  headers: string;
  mode: "direct" | "proxy";
  transport?: "sse" | "ws";
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

type UpdateEntry = (id: string, patch: Partial<PlaygroundHistoryEntry>) => void;

interface InitiateHttpParams {
  id: string;
  payload: SendPayload;
  sentAt: number;
  updateEntry: UpdateEntry;
  setSending: (sending: boolean) => void;
}

/** Send a one-shot HTTP request and route the result back into the entry. */
export function initiateHttpRequest({
  id,
  payload,
  sentAt,
  updateEntry,
  setSending,
}: InitiateHttpParams): void {
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
    if (payload.mode === "proxy" && !res.timing) {
      subscribeForProxyData(id, payload, sentAt, updateEntry);
    }
  });
}
