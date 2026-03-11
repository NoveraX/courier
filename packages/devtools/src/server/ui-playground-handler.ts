/**
 * Socket.IO playground handler — forwards requests to connected apps.
 */

import type { Namespace } from "socket.io";

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

export function handlePlayground(
  appNamespace: Namespace,
): (payload: PlaygroundPayload, callback: PlaygroundCallback) => void {
  return (payload, callback) => {
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

    const targetSocket = resolveTargetSocket(appSockets, payload.sessionId);
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

function resolveTargetSocket(
  appSockets: ReturnType<Namespace["sockets"]["values"]> extends IterableIterator<infer T>
    ? T[]
    : never,
  sessionId?: string,
): (typeof appSockets)[number] {
  if (sessionId) {
    const found = appSockets.find((s) => s.data?.sessionId === sessionId);
    if (found) return found;
  }
  return appSockets[0] as (typeof appSockets)[number];
}
