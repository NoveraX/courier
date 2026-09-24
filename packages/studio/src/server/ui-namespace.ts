/**
 * Socket.IO `/ui` namespace handler — manages Studio UI connections.
 *
 * Owns the UI side of every Studio↔runtime conversation: catalog +
 * binding-table snapshots on connect, mock-server lifecycle, watcher status,
 * imports snapshot, and the rid-keyed playground request flows. Routing to
 * the runtimes flows through the `/runtime` `BindingTable` + `runtimeRegistry`
 * — there is no longer a separate `/app` namespace.
 */

import { logger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import { buildBindingSnapshot } from "./binding-snapshot";
import type { BindingTable } from "./catalog/binding-table";
import { ConfigNotFoundError } from "./config-loader-errors";
import { loadImportsSnapshot, summarizeImports } from "./imports-bridge";
import type { LifecycleCoordinator } from "./mock-manager";
import { mockServers, runtimeRegistry } from "./runtime-namespace-state";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import {
  sanitizeMockCommand,
  sanitizeMockManaged,
  sanitizeMockServerEvent,
} from "./sanitize-mock-events";
import { scanProjectSources } from "./scan-project-sources";
import type { WatcherStatus } from "./watcher-status";

export interface SetupUiNamespaceDeps {
  uiNamespace: Namespace;
  bindingTable: BindingTable;
  mockManager?: LifecycleCoordinator;
  watcherStatus?: WatcherStatus;
  playgroundRouter?: RuntimePlaygroundRouter;
}

export function setupUiNamespace(deps: SetupUiNamespaceDeps): void {
  const { uiNamespace, bindingTable, mockManager, watcherStatus, playgroundRouter } = deps;

  uiNamespace.on("connection", (socket) => {
    // Send current binding-table snapshot so a UI client that joins after a
    // runtime has already announced gets the live state without waiting for
    // the next `runtime:announce`. This is the source of truth for the
    // status-bar runtime/source counts. Wrapped defensively so a corrupt
    // table never crashes the connect handler — the UI store has a sane
    // empty initial slice and will catch up on the next live broadcast.
    try {
      socket.emit("binding:snapshot", buildBindingSnapshot(bindingTable));
    } catch (err) {
      logger.warn("Studio", "Failed to emit initial binding:snapshot on UI connect", err);
      socket.emit("binding:snapshot", { rows: [], runtimeCount: 0, sourceCount: 0 });
    }

    // Push the current imports snapshot so the APIs page renders without an
    // extra HTTP round-trip. The Explorer still derives hand-written sources
    // from `binding:snapshot` pushed by the `/runtime` namespace.
    loadImportsSnapshot()
      .then((snapshot) => {
        socket.emit("registry:updated", { sources: summarizeImports(snapshot) });
      })
      .catch((err: unknown) => {
        /* Fresh projects without courier.config.ts are expected — stay quiet. */
        if (err instanceof ConfigNotFoundError) return;
        logger.warn("Studio", "Failed to emit imports snapshot on socket connect", err);
      });

    /* The APIs page and the mock wizard both list the project's own sources;
       without this they render as though the project declared none. */
    scanProjectSources()
      .then((scan) => {
        socket.emit("scan:sources", scan);
      })
      .catch((err: unknown) => {
        /* Fresh projects without courier.config.ts are expected — stay quiet. */
        if (err instanceof ConfigNotFoundError) return;
        logger.warn("Studio", "Failed to emit source scan on socket connect", err);
      });

    // Send current mock servers so UI restores state immediately.
    // Re-validate cached entries through sanitizeMockServerEvent for
    // defense-in-depth — the entries were sanitized on ingest but re-
    // validation guards against any theoretical in-memory corruption.
    for (const event of mockServers.values()) {
      const safe = sanitizeMockServerEvent(event);
      if (safe) socket.emit("event", safe);
    }

    // Send managed mock server states
    mockManager?.sendSnapshot();

    // Send current watcher status (watching N files indicator)
    watcherStatus?.sendSnapshot(socket);

    // Rid-keyed playground wire — `attachRuntime` callers register a
    // `playground-responder` that speaks the `playground:execute` protocol.
    // The router resolves the binding, dispatches the request, and forwards
    // `playground:chunk` / `playground:end` / `playground:error` back to the
    // originating UI socket. `playground:write` targets the owning runtime
    // directly via the router's `inFlight` map.
    if (playgroundRouter) {
      const router = playgroundRouter;
      socket.on("playground:exec", (raw: unknown) => router.dispatch(socket, raw));
      socket.on("playground:exec:cancel", (raw: unknown) => router.cancel(socket, raw));
      socket.on("playground:write", (raw: unknown) => router.write(socket, raw));
      socket.on("disconnect", () => router.onUiDisconnect(socket.id));
    }

    // Forward mock commands from UI → every connected runtime + managed
    // mock servers (IPC). The runtime side decides whether the command
    // applies to a mock it owns; non-owners no-op.
    socket.on("mock:command", (rawCommand: unknown) => {
      const command = sanitizeMockCommand(rawCommand);
      if (!command) return;
      for (const entry of runtimeRegistry.values()) {
        entry.socket.emit("mock:command", command);
      }
      mockManager?.forwardStoreCommand(command);
    });

    // Managed mock server lifecycle commands
    socket.on("mock:managed", (rawData: unknown) => {
      const data = sanitizeMockManaged(rawData);
      if (!data) return;
      mockManager?.handleCommand(data.command, data);
    });
  });
}
