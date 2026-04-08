/**
 * Socket.IO playground handler — forwards requests to connected apps.
 */

import { listAppSockets, pickExecutionSocket } from "./resolve-target-socket";
import { sanitizeUiPlaygroundPayload } from "./sanitize-ui-events";
import type { AppNamespace } from "./socket-data";

type PlaygroundCallback = (result: Record<string, unknown>) => void;

export function handlePlayground(
  appNamespace: AppNamespace,
): (payload: unknown, callback: PlaygroundCallback) => void {
  return (raw, callback) => {
    const payload = sanitizeUiPlaygroundPayload(raw);
    if (!payload) {
      callback({
        error: "Invalid playground payload",
        status: 0,
        headers: {},
        duration: 0,
      });
      return;
    }

    const appSockets = listAppSockets(appNamespace);
    if (appSockets.length === 0) {
      callback({
        error: "No application connected. Start your app with the Nexus studio plugin enabled.",
        status: 0,
        headers: {},
        duration: 0,
      });
      return;
    }

    // Direct: prefer server socket (has runtime sources).
    // Proxy: prefer browser socket (will fetch through /api/request like a real user).
    const targetSocket = pickExecutionSocket(appSockets, {
      sessionId: payload.sessionId,
      preferServer: payload.mode === "direct",
    });
    if (!targetSocket) {
      callback({
        error: "No application connected. Start your app with the Nexus studio plugin enabled.",
        status: 0,
        headers: {},
        duration: 0,
      });
      return;
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
        respond({ ...result, duration: result.duration ?? Date.now() - startTime });
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
  };
}
