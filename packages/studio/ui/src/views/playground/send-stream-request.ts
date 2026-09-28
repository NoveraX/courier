/**
 * Realtime stream (SSE / WS) dispatch for the playground.
 *
 * Fire-and-forget emit of `playground:exec { transport: "sse" | "ws" }`
 * over the rid-keyed wire. The runtime responder holds the subscription
 * and emits `playground:chunk` per event / incoming message; the UI
 * socket listeners accumulate those chunks into the playground entry via
 * `appendPlaygroundChunk`, and the terminal `playground:end` /
 * `playground:error` finalizes `streamStatus`.
 *
 * Unlike the old callback wire, there is no subscription handshake: the
 * caller already has the rid it stamped at entry creation, and the store
 * reducer is the single source of truth for streaming state.
 */

import { getSocket } from "@/socket";

import type { RequestValues } from "./request-values";
import type { SendPayload } from "./send-http-request";

interface InitiateStreamParams {
  rid: string;
  payload: SendPayload;
  values: RequestValues;
}

/**
 * Open a realtime stream for the playground entry. Returns nothing — the
 * caller observes progress via the store listeners driven by the
 * `playground:chunk` / `playground:end` / `playground:error` wire.
 */
export function initiateStreamRequest({ rid, payload, values }: InitiateStreamParams): void {
  getSocket().emit("playground:exec", {
    rid,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    transport: payload.transport,
    variables: values.variables,
    headers: values.headers,
  });
}
