/**
 * Socket.IO UI namespace handler — manages devtools UI connections.
 *
 * Emits catalog:snapshot on connect and on every catalog change.
 */

import type { Namespace } from "socket.io";
import { listSources, loadRegistry } from "../apis/registry/registry";
import { scanProject } from "../apis/scanner";
import { mockServers } from "./app-namespace";
import type { CatalogStore } from "./catalog";
import type { LifecycleCoordinator } from "./mock-manager";
import type { SessionInfo } from "./types";
import { handlePlayground } from "./ui-playground-handler";
import { handleReplay } from "./ui-replay-handler";

export function setupUiNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
  mockManager?: LifecycleCoordinator,
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

    // Send current scan + registry so APIs page works without HTTP round-trip
    try {
      socket.emit("scan:updated", scanProject());
      socket.emit("registry:updated", { sources: listSources(loadRegistry()) });
    } catch {
      // Scanner/registry may not be configured — non-critical
    }

    // Send current mock servers so UI restores state immediately
    for (const event of mockServers.values()) {
      socket.emit("event", event);
    }

    // Send managed mock server states
    mockManager?.sendSnapshot();

    // Handle explicit catalog requests (reconnection, gap recovery)
    socket.on("catalog:request", () => {
      socket.emit("catalog:snapshot", catalogStore.getSnapshot());
    });

    socket.on("replay", handleReplay(appNamespace));
    socket.on("playground:send", handlePlayground(appNamespace));

    // Forward mock commands from UI → app sockets (external) + managed servers (IPC)
    socket.on("mock:command", (command: unknown) => {
      for (const appSocket of appNamespace.sockets.values()) {
        appSocket.emit("mock:command", command);
      }
      mockManager?.forwardStoreCommand(command as Record<string, unknown>);
    });

    // Managed mock server lifecycle commands
    socket.on("mock:managed", (data: { command: string } & Record<string, unknown>) => {
      mockManager?.handleCommand(data.command, data);
    });
  });
}
