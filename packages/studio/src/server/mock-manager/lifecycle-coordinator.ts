/**
 * Mock lifecycle coordinator — public entry point for the studio server.
 *
 * Wires together the scanner, process manager, server-ops factory and
 * UI emitter into a single object the studio server uses to manage all
 * declared mock servers. The heavy logic lives in two siblings:
 *
 * - `lifecycle-process-events.ts` — `createProcessEvents()` builds the
 *   `ProcessManagerEvents` callbacks (onReady/onError/onStopped/...).
 * - `lifecycle-server-ops.ts` — `createServerOps()` provides
 *   start/stop/restart/registerDeclared and the port allocator.
 */

import { createLogger } from "@noverax/nexus";
import { createProcessEvents } from "./lifecycle-process-events";
import { createServerOps } from "./lifecycle-server-ops";
import { createProcessManager } from "./process-manager";
import { createScanner } from "./scanner";
import type { CoordinatorConfig, ServerState } from "./types";
import { createUiEmitter } from "./ui-emitter";

const log = createLogger("Studio");

/**
 * Wrap a fire-and-forget mock lifecycle promise so an unexpected rejection
 * (e.g. a child process kill that throws) is observed and logged instead of
 * becoming an unhandledRejection on the server process. `startServer` has
 * its own internal try/catch and does not need this wrapper.
 */
function runVoid(label: string, promise: Promise<unknown>): void {
  void promise.catch((err) => log.warn(`${label} failed`, err));
}

export function createLifecycleCoordinator(config: CoordinatorConfig) {
  const servers = new Map<string, ServerState>();
  const { emit, emitServerState } = createUiEmitter(config.uiNamespace);

  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    const state = servers.get(serverId);
    if (!state) return;
    Object.assign(state, patch);
    emitServerState(state);
  };

  const processManager = createProcessManager(
    createProcessEvents({ servers, emit, updateAndEmit }),
  );

  const { registerDeclared, startServer, stopServer, restartServer } = createServerOps({
    servers,
    basePort: config.basePort,
    processManager,
    updateAndEmit,
    emitServerState,
  });

  // ── Scanner ──────────────────────────────────────────────────────────────

  const scanner = createScanner(config.mocksDir, {
    onDeclared(declared) {
      registerDeclared(declared);
      if (declared.autoStart) void startServer(declared.id);
      config.watcherStatus?.setMockFileCount(servers.size);
    },
    onChanged(declared) {
      config.watcherStatus?.emitChange("mock", [declared.relativePath]);
      const state = servers.get(declared.id);
      if (state && state.status === "running") {
        runVoid(`restartServer(${declared.id})`, restartServer(declared.id));
      }
    },
    onRemoved(serverId) {
      runVoid(`stopServer(${serverId})`, stopServer(serverId));
      servers.delete(serverId);
      emit("mock:server:disconnect", { serverId });
      config.watcherStatus?.setMockFileCount(servers.size);
    },
  });

  // ── Public API ───────────────────────────────────────────────────────────

  function handleCommand(command: string, data: Record<string, unknown>): void {
    const serverId = data.serverId as string;
    switch (command) {
      case "mock:managed:start":
        void startServer(serverId);
        break;
      case "mock:managed:stop":
        runVoid(`stopServer(${serverId})`, stopServer(serverId));
        break;
      case "mock:managed:restart":
        runVoid(`restartServer(${serverId})`, restartServer(serverId));
        break;
      case "mock:managed:startAll":
        for (const id of servers.keys()) void startServer(id);
        break;
      case "mock:managed:stopAll":
        for (const id of servers.keys()) runVoid(`stopServer(${id})`, stopServer(id));
        break;
    }
  }

  /** Forward a mock:command (store/scenario) to the managed child process */
  function forwardStoreCommand(command: Record<string, unknown>): void {
    const serverId = command.serverId as string;
    if (servers.has(serverId)) {
      processManager.sendCommand(serverId, command);
    }
  }

  function sendSnapshot(): void {
    for (const state of servers.values()) {
      emitServerState(state);
    }
  }

  return {
    start: () => scanner.start(),
    stop: async () => {
      scanner.stop();
      await processManager.killAll();
      servers.clear();
    },
    handleCommand,
    forwardStoreCommand,
    sendSnapshot,
  };
}

export type LifecycleCoordinator = ReturnType<typeof createLifecycleCoordinator>;
