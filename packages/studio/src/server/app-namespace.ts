/**
 * Socket.IO app namespace setup — wires per-socket handlers from
 * `app-namespace-handlers.ts`. Mutation logic for session state, mock-server
 * tracking, and HMR runtime updates lives in the handlers module; the
 * globalThis-pinned Maps that survive HMR live in `app-namespace-state.ts`.
 */

import type { Namespace } from "socket.io";
import {
  type AppSocketHandlerDeps,
  handleAppDisconnect,
  handleAppEvent,
} from "./app-namespace-handlers";
import type { CatalogStore } from "./catalog";
import type { AppNamespace } from "./socket-data";
import type { SessionInfo } from "./types";

export { mockServers } from "./app-namespace-state";

export function setupAppNamespace(
  appNamespace: AppNamespace,
  uiNamespace: Namespace,
  sessions: Map<string, SessionInfo>,
  catalogStore: CatalogStore,
): void {
  const deps: AppSocketHandlerDeps = { uiNamespace, sessions, catalogStore };

  catalogStore.onNamesChange((mapping) => {
    appNamespace.emit("catalog:names", mapping);
  });

  appNamespace.on("connection", (socket) => {
    const ref: { current: string | undefined } = { current: undefined };

    const currentMapping = catalogStore.getNameMapping();
    if (Object.keys(currentMapping).length > 0) {
      socket.emit("catalog:names", currentMapping);
    }

    socket.on("event", (event: Record<string, unknown>) => {
      handleAppEvent(event, socket, ref, deps);
    });

    socket.on("disconnect", () => {
      handleAppDisconnect(socket, ref, deps);
    });
  });
}
