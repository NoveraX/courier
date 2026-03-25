/**
 * Socket.IO app namespace handler — manages application connections.
 *
 * Routes runtime source updates through CatalogStore instead of
 * storing per-session sources directly. Broadcasts canonical name
 * mappings so apps use correct source names in events.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { Namespace } from "socket.io";
import { removeSessionEnv, setSessionEnv } from "../runtime-env";
import { logAppConnect, logAppDisconnect } from "./banner";
import type { CatalogStore } from "./catalog";
import { bufferEvent } from "./session-buffer";
import type { SessionInfo } from "./types";

/** Tracked mock server state (last connect event payload) */
export const mockServers = new Map<string, Record<string, unknown>>();

/** Maps socket.id → Set of mock serverIds owned by that socket */
const socketMockServers = new Map<string, Set<string>>();

export function setupAppNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
): void {
  catalogStore.onNamesChange((mapping) => {
    appNamespace.emit("catalog:names", mapping);
  });

  appNamespace.on("connection", (socket) => {
    let sessionId: string | undefined;

    const currentMapping = catalogStore.getNameMapping();
    if (Object.keys(currentMapping).length > 0) {
      socket.emit("catalog:names", currentMapping);
    }

    socket.on("event", (event: Record<string, unknown>) => {
      bufferEvent(event);

      if (event.type === "connection:init") {
        sessionId = event.sessionId as string;
        socket.data.sessionId = sessionId;
        socket.data.framework = (event.framework as string) ?? "unknown";
        sessions.set(sessionId, {
          sessionId,
          framework: (event.framework as string) ?? "unknown",
          nexusVersion: (event.nexusVersion as string) ?? "0.0.0",
          connectedAt: Date.now(),
        });

        const sources = event.sources as SourceMap | undefined;
        if (sources && Object.keys(sources).length > 0) {
          catalogStore.setRuntimeLayer(sessionId, sources);
        }

        const env = event.env as Record<string, string> | undefined;
        if (env) setSessionEnv(sessionId, env);

        uiNamespace.emit("session:connect", sessions.get(sessionId));

        const fw = (event.framework as string) ?? "unknown";
        const origin = socket.handshake.headers.origin ?? socket.handshake.address;
        logAppConnect(fw, origin);
      }

      // HMR: runtime source update → catalog
      if (event.type === "connection:sources" && sessionId) {
        const sources = event.sources as SourceMap | undefined;
        if (sources) {
          catalogStore.setRuntimeLayer(sessionId, sources);
        }

        const env = event.env as Record<string, string> | undefined;
        if (env) setSessionEnv(sessionId, env);
      }

      // Track mock server state — keyed by socket.id for disconnect cleanup
      if (event.type === "mock:server:connect") {
        const serverId = event.serverId as string;
        if (serverId) {
          mockServers.set(serverId, event);
          const owned = socketMockServers.get(socket.id) ?? new Set();
          owned.add(serverId);
          socketMockServers.set(socket.id, owned);
        }
      }
      if (event.type === "mock:server:disconnect") {
        const serverId = event.serverId as string;
        if (serverId) {
          mockServers.delete(serverId);
          socketMockServers.get(socket.id)?.delete(serverId);
        }
      }

      // Keep cached connect event up-to-date with network config changes
      if (event.type === "mock:network:config") {
        const serverId = event.serverId as string;
        const cached = serverId ? mockServers.get(serverId) : undefined;
        if (cached) {
          const cfg = event.config as Record<string, unknown> | undefined;
          if (cfg) {
            cached.networkConfig = cfg;
            cached.latencyPreset = cfg.latencyPreset;
            cached.latencyStartedAt = cfg.latencyStartedAt;
            cached.chaosPreset = cfg.chaosPreset;
            cached.chaosStartedAt = cfg.chaosStartedAt;
          }
        }
      }

      // Forward all events to UI
      uiNamespace.emit("event", event);
    });

    socket.on("disconnect", () => {
      // App session cleanup
      if (sessionId) {
        const fw = (socket.data.framework as string) ?? "unknown";
        const origin = socket.handshake.headers.origin ?? socket.handshake.address;
        logAppDisconnect(fw, origin);

        catalogStore.removeRuntimeLayer(sessionId);
        removeSessionEnv(sessionId);
        sessions.delete(sessionId);
        uiNamespace.emit("session:disconnect", { sessionId });
      }

      // Mock server cleanup — works for both app sessions and standalone mock bridges
      const owned = socketMockServers.get(socket.id);
      if (owned) {
        for (const serverId of owned) {
          mockServers.delete(serverId);
          uiNamespace.emit("event", {
            id: `disconnect_${serverId}_${Date.now().toString(36)}`,
            type: "mock:server:disconnect",
            timestamp: Date.now(),
            sessionId: sessionId ?? socket.id,
            serverId,
          });
        }
        socketMockServers.delete(socket.id);
      }
    });
  });
}
