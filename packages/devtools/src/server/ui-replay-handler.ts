/**
 * Socket.IO replay handler — re-executes a request from timeline.
 */

import type { Namespace } from "socket.io";

interface ReplayPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

type ReplayCallback = (result: { ok: boolean; error?: string }) => void;

export function handleReplay(
  appNamespace: Namespace,
): (payload: ReplayPayload, callback: ReplayCallback) => void {
  return (payload, callback) => {
    const appSockets = Array.from(appNamespace.sockets.values());
    if (appSockets.length === 0) {
      callback({ ok: false, error: "No application connected" });
      return;
    }

    let responded = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const respond = (result: { ok: boolean; error?: string }) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeoutId);
      callback(result);
    };

    const targetSocket = appSockets[0] as (typeof appSockets)[number];
    targetSocket.emit(
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
