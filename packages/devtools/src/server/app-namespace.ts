/**
 * Socket.IO app namespace handler — manages application connections.
 *
 * Routes runtime source updates through CatalogStore instead of
 * storing per-session sources directly. Broadcasts canonical name
 * mappings so apps use correct source names in events.
 */

import type { SourceMap } from "@noverax/nexus-devtools-core";
import type { Namespace } from "socket.io";
import { removeSessionEnv, setSessionEnv } from "../runtime-env";
import type { CatalogStore } from "./catalog";
import { bufferEvent } from "./session-buffer";
import type { SessionInfo } from "./types";

export function setupAppNamespace(
  appNamespace: Namespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
): void {
  // Broadcast canonical name mappings to all connected apps
  catalogStore.onNamesChange((mapping) => {
    appNamespace.emit("catalog:names", mapping);
  });

  appNamespace.on("connection", (socket) => {
    let sessionId: string | undefined;

    // Send current name mapping to newly connected app
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

        // Feed initial sources into catalog (runtime layer)
        const sources = event.sources as SourceMap | undefined;
        if (sources && Object.keys(sources).length > 0) {
          catalogStore.setRuntimeLayer(sessionId, sources);
        }

        // Store app's process.env for scanner env resolution
        const env = event.env as Record<string, string> | undefined;
        if (env) setSessionEnv(sessionId, env);

        uiNamespace.emit("session:connect", sessions.get(sessionId));
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

      // Forward all events to UI (request lifecycle, middleware, etc.)
      uiNamespace.emit("event", event);
    });

    socket.on("disconnect", () => {
      if (sessionId) {
        catalogStore.removeRuntimeLayer(sessionId);
        removeSessionEnv(sessionId);
        sessions.delete(sessionId);
        uiNamespace.emit("session:disconnect", { sessionId });
      }
    });
  });
}
