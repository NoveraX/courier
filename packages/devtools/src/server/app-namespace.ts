/**
 * Socket.IO app namespace handler — manages application connections.
 */

import type { Namespace } from "socket.io";
import { bufferEvent } from "./session-buffer";
import type { SessionInfo } from "./types";

export function setupAppNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
): void {
  appNamespace.on("connection", (socket) => {
    let sessionId: string | undefined;

    socket.on("event", (event: Record<string, unknown>) => {
      // Buffer events for session persistence
      bufferEvent(event);

      // Track sessions
      if (event.type === "connection:init") {
        sessionId = event.sessionId as string;
        socket.data.sessionId = sessionId;
        sessions.set(sessionId, {
          sessionId,
          framework: (event.framework as string) ?? "unknown",
          nexusVersion: (event.nexusVersion as string) ?? "0.0.0",
          sources: (event.sources as Record<string, unknown>) ?? {},
          connectedAt: Date.now(),
        });

        // Notify UI of new session
        uiNamespace.emit("session:connect", sessions.get(sessionId));
      }

      // Forward all events to UI namespace
      uiNamespace.emit("event", event);
    });

    socket.on("disconnect", () => {
      if (sessionId) {
        sessions.delete(sessionId);
        uiNamespace.emit("session:disconnect", { sessionId });
      }
    });
  });
}
