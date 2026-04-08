/**
 * Socket.IO handler for sending WS messages from the Studio UI.
 *
 * Routing strategy: **always broadcast**, identical in spirit to
 * `playground:stream:cancel` (see `broadcastToApps` in `ui-namespace.ts`).
 * The Studio server cannot know which app process owns a given
 * `requestId` — ownership lives in process-global registries inside the
 * owning `studio-core` (`playgroundChannelRegistry` / `connectionMap`),
 * which can be either the server-side `instrumentServer` OR a browser
 * `studio-core` bundle. We fan the send out to every connected app, the
 * owner answers `ok:true`, every non-owner answers a clean `ok:false`
 * no-op. The first success wins.
 *
 * Unlike cancel (which is fire-and-forget), `playground:ws:send` MUST
 * report delivery back to the UI — the user pressed "send" and needs to
 * know whether their message landed. That's why this handler uses
 * `broadcastWSSend` (collect-and-wait-for-first-success with per-socket
 * timeout) instead of `broadcastToApps` (synchronous fire-and-forget).
 */

import { createLogger } from "@noverax/nexus";
import { broadcastWSSend } from "./broadcast-ws-send";
import { sanitizeUiWSSendPayload } from "./sanitize-ui-events";
import type { AppNamespace } from "./socket-data";

const log = createLogger("Studio");

type WSSendCallback = (result: { ok: boolean; error?: string }) => void;

export function handleWSSend(
  appNamespace: AppNamespace,
): (payload: unknown, callback: WSSendCallback) => void {
  return (raw, callback) => {
    const payload = sanitizeUiWSSendPayload(raw);
    if (!payload) {
      callback({ ok: false, error: "Invalid playground:ws:send payload" });
      return;
    }

    const sockets = Array.from(appNamespace.sockets.values());
    // .catch is required: broadcastWSSend can reject (e.g. if the underlying
    // emit throws synchronously), and an unhandled rejection here would
    // crash the Studio server process. We surface a clean error to the UI
    // and log the underlying cause for diagnostics.
    void broadcastWSSend(sockets, payload)
      .then(callback)
      .catch((err) => {
        log.warn("playground:ws:send broadcast failed", err);
        callback({ ok: false, error: "Internal broadcast failure" });
      });
  };
}
