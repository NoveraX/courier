/**
 * Socket.IO UI namespace handler — manages devtools UI connections.
 */

import type { Namespace } from "socket.io";
import type { SessionInfo } from "./types";

export function setupUiNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
): void {
  uiNamespace.on("connection", (socket) => {
    // Send current sessions to newly connected UI
    socket.emit("sessions", Array.from(sessions.values()));

    // Replay: re-execute a request from timeline
    socket.on("replay", (payload: ReplayPayload, callback: ReplayCallback) => {
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
          if (result.error) {
            respond({ ok: false, error: String(result.error) });
          } else {
            respond({ ok: true });
          }
        },
      );

      timeoutId = setTimeout(() => {
        respond({ ok: false, error: "Application did not respond within 15s" });
      }, 15_000);
    });

    // Playground: forward request to a connected app and return the result
    socket.on("playground:send", (payload: PlaygroundPayload, callback: PlaygroundCallback) => {
      const appSockets = Array.from(appNamespace.sockets.values());
      if (appSockets.length === 0) {
        callback({
          error: "No application connected. Start your app with the Nexus devtools plugin enabled.",
          status: 0,
          headers: {},
          duration: 0,
        });
        return;
      }

      let targetSocket = appSockets[0] as (typeof appSockets)[number];
      if (payload.sessionId) {
        const found = appSockets.find((s) => s.data?.sessionId === payload.sessionId);
        if (found) targetSocket = found;
      }

      const startTime = Date.now();
      let responded = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const respond = (result: Record<string, unknown>) => {
        if (responded) return;
        responded = true;
        clearTimeout(timeoutId);
        callback(result);
      };

      targetSocket.emit(
        "playground:execute",
        {
          source: payload.source,
          group: payload.group,
          method: payload.method,
          variables: payload.variables,
          headers: payload.headers,
          mode: payload.mode,
        },
        (result: Record<string, unknown>) => {
          respond({
            ...result,
            duration: result.duration ?? Date.now() - startTime,
          });
        },
      );

      timeoutId = setTimeout(() => {
        respond({
          error: "Application did not respond within 30s",
          status: 0,
          headers: {},
          duration: Date.now() - startTime,
        });
      }, 30_000);
    });
  });
}

// ── Payload types ────────────────────────────────────────────────────────────

interface ReplayPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

type ReplayCallback = (result: { ok: boolean; error?: string }) => void;

interface PlaygroundPayload {
  sessionId?: string;
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

type PlaygroundCallback = (result: Record<string, unknown>) => void;
