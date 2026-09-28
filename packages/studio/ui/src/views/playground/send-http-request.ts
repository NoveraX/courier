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
import { subscribeForRunData } from "./run-data";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { RequestValues } from "./request-values";

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
  values: RequestValues;
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
  values,
  sentAt,
  updateEntry,
  setSending,
}: InitiateHttpParams): void {
  getSocket().emit("playground:exec", {
    rid,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    mode: payload.mode,
    transport: "http",
    variables: values.variables,
    headers: values.headers,
  });

  // The rid-keyed wire drives response state through store reducers, so
  // the sending spinner flips off as soon as the emit is queued. The
  // terminal `playground:end` follows shortly after from the runtime
  // responder and finalizes status/duration on the entry.
  setSending(false);

  // The timing comes from the parallel `event` stream the runtime
  // publishes via `wireHooks`, which the rid-keyed wire does not carry.
  subscribeForRunData(id, payload, sentAt, updateEntry);
}
