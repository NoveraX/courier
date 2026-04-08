/**
 * Broadcast `playground:ws:send` to every connected app socket and return
 * the first successful response.
 *
 * Why broadcast: the studio server has no `requestId → socket` registry,
 * because a WS subscription's `requestId` can be owned by EITHER the
 * server-side `instrumentServer` process OR a browser `studio-core` bundle,
 * depending on which side opened `useWSSubscription`. Each app process
 * keeps its own `playgroundChannelRegistry` / `connectionMap` on
 * `globalThis`, and only the owning process can resolve the requestId.
 *
 * The same problem already exists for `playground:stream:cancel` (see
 * `socket.ts:126-139` in studio-core) and is solved with the exact same
 * pattern: fan out to all sockets, the owner returns `ok:true`, every
 * non-owner returns a clean `ok:false` no-op. We collect both and report
 * success if at least one socket owned the requestId.
 *
 * Per-socket timeout protects against an unresponsive app: a hung socket
 * cannot delay or fail the operation if another socket already answered
 * successfully. Errors are aggregated to surface the most actionable one.
 *
 * **Difference from `broadcastToApps` (in `ui-namespace.ts`)**: that helper
 * is fire-and-forget — it returns `{ok:true}` synchronously and only logs
 * per-socket errors. Use it for events where the UI does NOT need a real
 * delivery confirmation (e.g. `playground:stream:cancel`). Use
 * `broadcastWSSend` when the UI must know whether the send actually
 * reached an owner (e.g. `playground:ws:send`).
 */

import type { AppSocket } from "./socket-data";

export interface WSSendBroadcastPayload {
  requestId: string;
  topic: string;
  data: unknown;
}

export interface WSSendBroadcastResult {
  ok: boolean;
  error?: string;
}

const PER_SOCKET_TIMEOUT_MS = 5_000;

/**
 * Fan out a `playground:ws:send` to every socket and resolve once we have
 * an authoritative answer (any `ok:true`, OR every socket reported back).
 */
export function broadcastWSSend(
  sockets: readonly AppSocket[],
  payload: WSSendBroadcastPayload,
): Promise<WSSendBroadcastResult> {
  if (sockets.length === 0) {
    return Promise.resolve({ ok: false, error: "No application connected" });
  }

  return new Promise((resolve) => {
    const errors: string[] = [];
    let pending = sockets.length;
    let settled = false;

    const settle = (result: WSSendBroadcastResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const finalize = () => {
      if (settled) return;
      // No socket owned the requestId. Pick the most specific error if any.
      const preferred =
        errors.find((e) => /not subscribed/i.test(e)) ??
        errors.find((e) => !/no active connection/i.test(e)) ??
        errors[0] ??
        "No application owns this requestId";
      settle({ ok: false, error: preferred });
    };

    for (const socket of sockets) {
      let respondedForThisSocket = false;
      const timeoutId = setTimeout(() => {
        if (respondedForThisSocket) return;
        respondedForThisSocket = true;
        errors.push(`Socket ${socket.id} timed out`);
        pending -= 1;
        if (pending === 0) finalize();
      }, PER_SOCKET_TIMEOUT_MS);

      socket.emit("playground:ws:send", payload, (result: { ok: boolean; error?: string }) => {
        if (respondedForThisSocket) return;
        respondedForThisSocket = true;
        clearTimeout(timeoutId);

        if (result?.ok) {
          settle({ ok: true });
          return;
        }

        if (result?.error) errors.push(result.error);
        pending -= 1;
        if (pending === 0) finalize();
      });
    }
  });
}
