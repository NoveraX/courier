/**
 * Socket.IO replay handler — re-executes a request from timeline.
 *
 * Routes the replayed request to the app socket whose runtime layer
 * actually hosts the requested endpoint via `pickStreamTargetSocket`
 * (the same smart-routing helper that `playground:stream` uses). Before
 * this, replay always picked `appSockets[0]`, which silently mis-routed
 * to the wrong app in 2-app setups (e.g. standalone WS-only server +
 * Next.js HTTP/SSE) — the WS-only server would receive an HTTP replay
 * request and silently drop it.
 */

import type { CatalogStore } from "./catalog";
import { pickStreamTargetSocket } from "./playground-stream-routing";
import { sanitizeUiReplayPayload } from "./sanitize-ui-events";
import type { AppNamespace } from "./socket-data";

type ReplayCallback = (result: { ok: boolean; error?: string }) => void;

export function handleReplay(
  appNamespace: AppNamespace,
  catalogStore: CatalogStore,
): (payload: unknown, callback: ReplayCallback) => void {
  return (raw, callback) => {
    const payload = sanitizeUiReplayPayload(raw);
    if (!payload) {
      callback({ ok: false, error: "Invalid replay payload" });
      return;
    }

    // Replay is always HTTP (no transport field) — `pickStreamTargetSocket`
    // matches HTTP endpoints when payload.transport is undefined.
    const route = pickStreamTargetSocket(appNamespace, catalogStore, {
      source: payload.source,
      group: payload.group,
      method: payload.method,
    });

    if (route.kind === "no-apps") {
      callback({ ok: false, error: "No application connected" });
      return;
    }
    if (route.kind === "no-host") {
      callback({
        ok: false,
        error: `No connected app hosts HTTP endpoint ${payload.source}.${payload.group}.${payload.method}. Connected apps: ${route.sampledFrameworks.join(", ")}`,
      });
      return;
    }

    let responded = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const respond = (result: { ok: boolean; error?: string }): void => {
      if (responded) return;
      responded = true;
      clearTimeout(timeoutId);
      callback(result);
    };

    route.socket.emit(
      "playground:execute",
      {
        source: payload.source,
        group: payload.group,
        method: payload.method,
        variables: payload.variables,
        headers: payload.headers ?? {},
        mode: payload.mode,
      },
      (result: Record<string, unknown>) => {
        respond(result.error ? { ok: false, error: String(result.error) } : { ok: true });
      },
    );

    timeoutId = setTimeout(() => {
      respond({ ok: false, error: "Application did not respond within 15s" });
    }, 15_000);
  };
}
