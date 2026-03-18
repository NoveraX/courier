/**
 * Socket.IO UI namespace handler — manages devtools UI connections.
 *
 * Emits catalog:snapshot on connect and on every catalog change.
 */

import type { Namespace } from "socket.io";
import type { CatalogStore } from "./catalog";
import type { SessionInfo } from "./types";
import { handlePlayground } from "./ui-playground-handler";
import { handleReplay } from "./ui-replay-handler";

export function setupUiNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
): void {
  // Broadcast catalog changes to all connected UI clients
  catalogStore.onChange((snapshot) => {
    uiNamespace.emit("catalog:snapshot", snapshot);
  });

  uiNamespace.on("connection", (socket) => {
    // Send current sessions (without sources — catalog is separate)
    socket.emit("sessions", Array.from(sessions.values()));

    // Send current catalog snapshot
    socket.emit("catalog:snapshot", catalogStore.getSnapshot());

    // Handle explicit catalog requests (reconnection, gap recovery)
    socket.on("catalog:request", () => {
      socket.emit("catalog:snapshot", catalogStore.getSnapshot());
    });

    socket.on("replay", handleReplay(appNamespace));
    socket.on("playground:send", handlePlayground(appNamespace));
  });
}
