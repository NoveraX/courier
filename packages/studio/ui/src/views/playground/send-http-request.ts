/**
 * One-shot HTTP request dispatch for the playground.
 *
 * Fire-and-forget emit of `playground:exec` over the rid-keyed wire. The
 * response arrives asynchronously via the `playground:chunk` /
 * `playground:end` / `playground:error` socket listeners which fold the
 * result into the store through `appendPlaygroundChunk` / `endPlayground`
 * / `errorPlayground` — no per-request callback is attached here.
 *
 * The 30s timeout that the legacy callback wire enforced lives server-side
 * in `runtime-playground-router.ts` now, so hung requests surface as
 * `playground:error` through the same store path as natural errors.
 */

import { getSocket } from "@/socket";
import { safeParse } from "./playground-utils";
import { subscribeForProxyData } from "./proxy-data";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";

export interface SendPayload {
  source: string;
  group: string;
  method: string;
  variables: string;
  headers: string;
  mode: "direct" | "proxy";
  transport?: "sse" | "ws";
}

type UpdateEntry = (id: string, patch: Partial<PlaygroundHistoryEntry>) => void;

interface InitiateHttpParams {
  id: string;
  rid: string;
  payload: SendPayload;
  sentAt: number;
  updateEntry: UpdateEntry;
  setSending: (sending: boolean) => void;
}

/**
 * Emit a `playground:exec` HTTP request over the rid-keyed wire. The
 * response flows back asynchronously via the global chunk/end/error
 * listeners, which is why there is no callback attached to the emit.
 */
export function initiateHttpRequest({
  id,
  rid,
  payload,
  sentAt,
  updateEntry,
  setSending,
}: InitiateHttpParams): void {
  getSocket().emit("playground:exec", {
    rid,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    transport: "http",
    variables: safeParse(payload.variables, undefined),
    headers: safeParse<Record<string, string>>(payload.headers, {}),
  });

  // The rid-keyed wire drives response state through store reducers, so
  // the sending spinner flips off as soon as the emit is queued. The
  // terminal `playground:end` follows shortly after from the runtime
  // responder and finalizes status/duration on the entry.
  setSending(false);

  // Proxy mode still hydrates entry timing from the parallel `event`
  // stream that the runtime publishes via `wireHooks`. The rid-keyed
  // wire does not carry proxy:receive/respond telemetry, so this
  // subscription stays exactly as before.
  if (payload.mode === "proxy") {
    subscribeForProxyData(id, payload, sentAt, updateEntry);
  }
}
