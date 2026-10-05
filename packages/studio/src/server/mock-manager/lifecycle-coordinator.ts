/**
 * Mock lifecycle coordinator — public entry point for the studio server.
 *
 * Subscribes to the `MockRegistry` events (driven from `courier.mocks.ts` by
 * the config watcher) and translates them into `ServerState` registrations,
 * managed child-process spawns and UI emissions. Each mock is described from
 * the definition Studio already loaded, so the Explorer lists its routes,
 * collections and scenarios before it runs.
 */

import { createLogger } from "@noverax/courier";
import type { Socket } from "socket.io";
import type { MockEntry } from "../mock-registry";
import type { SanitizedMockCommand } from "../sanitize-mock-events";
import { createDescriptionApplier } from "./apply-description";
import { createCommandHandler } from "./command-handler";
import type { CommandReply } from "./command-replies";
import { createProcessEvents } from "./lifecycle-process-events";
import { createServerOps } from "./lifecycle-server-ops";
import { declaredPorts } from "./mock-ports";
import { createMockRegistration } from "./mock-registration";
import { createMocksFileState, type MocksFileStatus } from "./mocks-file-state";
import { patchChanges } from "./patch-changes";
import { createProcessManager } from "./process-manager";
import type { CoordinatorConfig, MockSummary, ServerState } from "./types";
import { createUiEmitter } from "./ui-emitter";

const log = createLogger("Studio");

/**
 * Observe a fire-and-forget lifecycle promise, so a failure is logged rather
 * than left as an unhandled rejection in Studio's process.
 */
function runVoid(label: string, promise: Promise<unknown>): void {
  void promise.catch((err: unknown) => log.warn(`${label} failed`, err));
}

/** Studio's managed mocks, as the rest of Studio drives them. */
export interface LifecycleCoordinator {
  /** Stop every mock and start none again. */
  stop(): Promise<void>;
  handleCommand(command: string, data: Record<string, unknown>): void;
  /** Run a store command on the mock it names; `undefined` when Studio has no mock by that name. */
  forwardStoreCommand(command: SanitizedMockCommand): Promise<CommandReply> | undefined;
  /** Send a page that connects every mock's state and the mocks file's status. */
  sendSnapshot(socket: Socket): void;
  summarizeServers(): MockSummary[];
  setMocksFile(next: MocksFileStatus): void;
}

export function createLifecycleCoordinator(config: CoordinatorConfig): LifecycleCoordinator {
  const servers = new Map<string, ServerState>();
  const { emit, emitServerState, sendServerState } = createUiEmitter(config.uiNamespace);
  let closed = false;

  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    const state = servers.get(serverId);
    if (!state || !patchChanges(state, patch)) return;
    Object.assign(state, patch);
    emitServerState(state);
  };

  const processManager = createProcessManager(
    createProcessEvents({
      servers,
      emit,
      updateAndEmit,
      mockLog: config.mockLog,
      resendStore: (serverId) =>
        runVoid(
          `resendStore(${serverId})`,
          processManager.sendCommand(serverId, { action: "mock:store:resend", serverId }),
        ),
    }),
    { transformCacheDirectory: config.transformCacheDirectory, storeFile: config.storeFile },
  );
  const reservedPorts = () => declaredPorts(config.mockRegistry.getEntries());
  const isClosed = () => closed;
  const mocksFile = createMocksFileState({
    servers,
    updateAndEmit,
    broadcast: (status) => config.uiNamespace.emit("mocks:status", status),
  });

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
    getMocksPath: mocksFile.path,
    isAlive: processManager.has,
    isCurrent: (entry: MockEntry) =>
      config.mockRegistry
        .getEntries()
        .some((e) => e.key === entry.key && e.definition === entry.definition),
    isClosed,
  });

  const detach = config.mockRegistry.attach({
    onAdded(entry) {
      runVoid(`register(${entry.key})`, apply(entry));
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
        const declaredAgain = config.mockRegistry.getEntries().find((e) => e.key === key);
        if (declaredAgain && !closed) {
          runVoid(`register(${key})`, apply(declaredAgain));
        }
      };
      runVoid(`remove(${key})`, ops.removeServer(key, gone));
    },
  });

  const handleCommand = createCommandHandler(servers, ops, runVoid);

  /** Every tracked mock: whether it runs, and the port it is on or will be. */
  function summarizeServers(): MockSummary[] {
    return [...servers.values()].map((state) => ({
      key: state.serverId,
      alive: processManager.has(state.serverId),
      port: state.actualPort ?? state.configuredPort,
      portDeclared: state.portDeclared,
    }));
  }

  /** Run a command on the mock it names, with that mock's answer; `undefined` when Studio has no mock by that name. */
  function forwardStoreCommand(command: SanitizedMockCommand): Promise<CommandReply> | undefined {
    if (!servers.has(command.serverId)) return undefined;
    return processManager.sendCommand(command.serverId, command);
  }

  function sendSnapshot(socket: Socket): void {
    for (const state of servers.values()) sendServerState(socket, state);
    socket.emit("mocks:status", mocksFile.status());
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

  return {
    stop,
    handleCommand,
    forwardStoreCommand,
    sendSnapshot,
    summarizeServers,
    setMocksFile: mocksFile.set,
  };
}
