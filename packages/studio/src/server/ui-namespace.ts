/**
 * Socket.IO `/ui` namespace handler — manages Studio UI connections.
 *
 * Owns the UI side of every Studio↔runtime conversation: on connect the
 * binding-table snapshot and the project Studio runs (its imports, its
 * sources and how the config loads), then mock-server lifecycle, watcher
 * status, and the rid-keyed playground request flows. Routing to the
 * runtimes flows through the `/runtime` `BindingTable` + `runtimeRegistry`.
 */

import { logger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import { buildBindingSnapshot } from "./binding-snapshot";
import type { BindingTable } from "./catalog/binding-table";
import type { LifecycleCoordinator } from "./mock-manager";
import { sendProject } from "./project-state/send-project";
import type { ProjectReads } from "./project-state/types";
import type { RequestLog } from "./request-log";
import { keptIdsOf } from "./request-log-clear";
import { mockServers, runtimeRegistry } from "./runtime-namespace-state";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import {
  sanitizeMockCommand,
  sanitizeMockManaged,
  sanitizeMockServerEvent,
} from "./sanitize-mock-events";
import type { WatcherStatus } from "./watcher-status";

export interface SetupUiNamespaceDeps {
  uiNamespace: Namespace;
  bindingTable: BindingTable;
  /** The project Studio runs, replayed to each UI that connects. */
  project: ProjectReads;
  /** The project root, symlinks resolved. */
  projectRoot: string;
  mockManager?: LifecycleCoordinator;
  watcherStatus?: WatcherStatus;
  playgroundRouter?: RuntimePlaygroundRouter;
  /** The requests captured so far, replayed to each UI that connects. */
  requestLog?: RequestLog;
}

/**
 * Serve each Studio UI that connects: replay the state it needs, then take
 * its playground and mock commands.
 *
 * @param deps - The namespace, and what is replayed and commanded
 *
 * @example
 * ```ts
 * setupUiNamespace({ uiNamespace, bindingTable, project, projectRoot, mockManager, watcherStatus });
 * ```
 */
export function setupUiNamespace(deps: SetupUiNamespaceDeps): void {
  const { uiNamespace, bindingTable, mockManager, watcherStatus, playgroundRouter, requestLog } =
    deps;
  const { project, projectRoot } = deps;

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

    /* The imports, the sources and how the config loads, from what Studio
       runs: never a load of its own. A UI that connects while Studio starts
       is told so, and gets the lists with the first outcome. socket.io calls
       this handler outside any promise, so a throw here would stop Studio. */
    try {
      sendProject(socket, project.snapshot(), projectRoot);
    } catch (err) {
      logger.warn("Studio", "Failed to send the project to a UI that connected", err);
    }

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

    /* The requests captured before this UI connected, so a page that loads
       or reloads shows them. Clearing the log in one page forgets them here
       too, except the ones it keeps. */
    if (requestLog) {
      socket.emit("events:replay", requestLog.events());
      socket.on("requests:clear", (raw: unknown) => {
        const keep = keptIdsOf(raw);
        if (keep) requestLog.forget(keep);
      });
    }

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
