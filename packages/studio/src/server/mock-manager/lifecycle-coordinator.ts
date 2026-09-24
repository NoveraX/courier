/**
 * Mock lifecycle coordinator — public entry point for the studio server.
 *
 * Subscribes to the `MockRegistry` events (driven from `courier.config.ts.mocks`
 * by the config-watcher) and translates them into `ServerState` registrations,
 * managed child-process spawns and UI emissions. Each mock is described from
 * the definition Studio already loaded, so the Explorer lists its routes,
 * collections and scenarios before it runs.
 */

import { createLogger } from "@noverax/courier";
import type { MockEntry } from "../mock-registry";
import { createDescriptionApplier } from "./apply-description";
import { createProcessEvents } from "./lifecycle-process-events";
import { createServerOps } from "./lifecycle-server-ops";
import { declaredPorts } from "./mock-ports";
import { createMockRegistration } from "./mock-registration";
import { createProcessManager } from "./process-manager";
import type { CoordinatorConfig, ServerState } from "./types";
import { createUiEmitter } from "./ui-emitter";

const log = createLogger("Studio");

/**
 * Observe a fire-and-forget lifecycle promise, so a failure is logged rather
 * than left as an unhandled rejection in Studio's process.
 */
function runVoid(label: string, promise: Promise<unknown>): void {
  void promise.catch((err) => log.warn(`${label} failed`, err));
}

export function createLifecycleCoordinator(config: CoordinatorConfig) {
  const servers = new Map<string, ServerState>();
  const { emit, emitServerState } = createUiEmitter(config.uiNamespace);
  let closed = false;

  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    const state = servers.get(serverId);
    if (!state) return;
    Object.assign(state, patch);
    emitServerState(state);
  };

  const processManager = createProcessManager(
    createProcessEvents({ servers, emit, updateAndEmit }),
  );
  const reservedPorts = () => declaredPorts(config.mockRegistry.getEntries());
  const isClosed = () => closed;

  const registration = createMockRegistration({
    servers,
    basePort: config.basePort,
    reservedPorts,
    isAlive: processManager.has,
    updateAndEmit,
    emitServerState,
  });
  const ops = createServerOps({ servers, processManager, updateAndEmit, reservedPorts, isClosed });
  const apply = createDescriptionApplier({
    servers,
    registration,
    ops,
    getConfigPath: config.getConfigPath,
    isAlive: processManager.has,
    isCurrent: (entry: MockEntry) =>
      config.mockRegistry
        .getEntries()
        .some((e) => e.key === entry.key && e.definition === entry.definition),
    isClosed,
  });

  const countMocks = () => config.watcherStatus?.setMockFileCount(servers.size);

  const detach = config.mockRegistry.attach({
    onAdded(entry) {
      runVoid(`register(${entry.key})`, apply(entry).then(countMocks));
    },
    onChanged(entry) {
      config.watcherStatus?.emitChange("mock", [entry.key]);
      runVoid(`update(${entry.key})`, apply(entry));
    },
    /* Removal waits for the mock to stop; one declared again meanwhile is
       registered afresh once it is gone. */
    onRemoved(key) {
      const gone = () => {
        emit("mock:server:disconnect", { serverId: key });
        countMocks();
        const declaredAgain = config.mockRegistry.getEntries().find((e) => e.key === key);
        if (declaredAgain && !closed) {
          runVoid(`register(${key})`, apply(declaredAgain).then(countMocks));
        }
      };
      runVoid(`remove(${key})`, ops.removeServer(key, gone));
    },
  });

  function handleCommand(command: string, data: Record<string, unknown>): void {
    const serverId = data.serverId as string;
    switch (command) {
      case "mock:managed:start":
        runVoid(`start(${serverId})`, ops.startServer(serverId));
        break;
      case "mock:managed:stop":
        runVoid(`stop(${serverId})`, ops.stopServer(serverId));
        break;
      case "mock:managed:restart":
        runVoid(`restart(${serverId})`, ops.restartServer(serverId));
        break;
      case "mock:managed:startAll":
        for (const id of servers.keys()) runVoid(`start(${id})`, ops.startServer(id));
        break;
      case "mock:managed:stopAll":
        for (const id of servers.keys()) runVoid(`stop(${id})`, ops.stopServer(id));
        break;
    }
  }

  function forwardStoreCommand(command: Record<string, unknown>): void {
    const serverId = command.serverId as string;
    if (servers.has(serverId)) processManager.sendCommand(serverId, command);
  }

  function sendSnapshot(): void {
    for (const state of servers.values()) emitServerState(state);
  }

  /**
   * Stop every mock and start none again: config loads and commands that
   * arrive later are ignored, and operations already underway finish first,
   * so no worker is forked after this resolves.
   */
  async function stop(): Promise<void> {
    closed = true;
    detach();
    await ops.settled();
    await processManager.dispose();
    servers.clear();
  }

  return { stop, handleCommand, forwardStoreCommand, sendSnapshot };
}

export type LifecycleCoordinator = ReturnType<typeof createLifecycleCoordinator>;
