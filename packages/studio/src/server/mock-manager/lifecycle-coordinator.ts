/**
 * Mock lifecycle coordinator — public entry point for the studio server.
 *
 * Subscribes to the `MockRegistry` events (driven from `nexus.config.ts.mocks`
 * by the config-watcher) and translates them into `ServerState` registrations,
 * managed child-process spawns and UI emissions. Route/collection/scenario
 * metadata for the UI is extracted before spawn via the persistent meta-pool
 * worker so the Explorer renders immediately, even when the mock is not yet
 * `autoStart`-ed.
 */

import { basename } from "node:path";
import { createLogger } from "@noverax/nexus";
import type { MockEntry } from "../mock-registry";
import { createProcessEvents } from "./lifecycle-process-events";
import { createServerOps } from "./lifecycle-server-ops";
import type { MetaResult } from "./meta-pool";
import { createMetaPool } from "./meta-pool";
import { createProcessManager } from "./process-manager";
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

function emptyMeta(): MetaResult {
  return { autoStart: false, routes: [], collections: [], scenarios: [] };
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

  const metaPool = createMetaPool();

  // ── Registry → Coordinator wiring ────────────────────────────────────────

  async function materializeAndRegister(entry: MockEntry): Promise<void> {
    const configPath = config.getConfigPath();
    if (!configPath) {
      log.warn(`Cannot register mock "${entry.key}": nexus.config.ts not loaded`);
      return;
    }
    const meta = (await metaPool.analyze(configPath, entry.key)) ?? emptyMeta();
    const relativePath = `${basename(configPath)}:mocks.${entry.key}`;
    registerDeclared({ key: entry.key, configPath, relativePath, meta });
    if (meta.autoStart) void startServer(entry.key);
    config.watcherStatus?.setMockFileCount(servers.size);
  }

  config.mockRegistry.attach({
    onAdded(entry) {
      runVoid(`materializeAndRegister(${entry.key})`, materializeAndRegister(entry));
    },
    onChanged(entry) {
      config.watcherStatus?.emitChange("mock", [entry.key]);
      const state = servers.get(entry.key);
      if (state && state.status === "running") {
        runVoid(`restartServer(${entry.key})`, restartServer(entry.key));
      }
    },
    onRemoved(key) {
      runVoid(`stopServer(${key})`, stopServer(key));
      servers.delete(key);
      emit("mock:server:disconnect", { serverId: key });
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
    /** No-op kept for API compatibility — registry events drive registration now. */
    start: () => {},
    stop: async () => {
      metaPool.shutdown();
      await processManager.killAll();
      servers.clear();
    },
    handleCommand,
    forwardStoreCommand,
    sendSnapshot,
  };
}

export type LifecycleCoordinator = ReturnType<typeof createLifecycleCoordinator>;
