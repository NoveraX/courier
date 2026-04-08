/**
 * Server start/stop/restart helpers for the mock lifecycle coordinator.
 *
 * Provides:
 *
 * - `allocateNextPort` — find the next free port not already assigned to a
 *   tracked server.
 * - `registerDeclared` — turn a `DeclaredServer` from the scanner into a
 *   tracked `ServerState` and emit it to the UI.
 * - `startServer` / `stopServer` / `restartServer` — drive the
 *   `processManager` while keeping the local `ServerState` in sync.
 *
 * The factory accepts the shared mutable state (servers map, port cursor,
 * processManager, emitter) by reference so the operations can run inline
 * inside the coordinator's closure.
 */

import type { ProcessManager } from "./process-manager";
import type { DeclaredServer } from "./scanner";
import type { ServerState } from "./types";

export interface ServerOpsContext {
  servers: Map<string, ServerState>;
  basePort: number;
  processManager: ProcessManager;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  emitServerState: (state: ServerState) => void;
}

export interface ServerOps {
  registerDeclared: (declared: DeclaredServer) => void;
  startServer: (serverId: string) => Promise<void>;
  stopServer: (serverId: string) => Promise<void>;
  restartServer: (serverId: string) => Promise<void>;
}

export function createServerOps(ctx: ServerOpsContext): ServerOps {
  const { servers, processManager, updateAndEmit, emitServerState } = ctx;
  let nextPort = ctx.basePort;

  /** Find the next port that isn't already assigned to a tracked server */
  function allocateNextPort(): number {
    const usedPorts = new Set<number>();
    for (const s of servers.values()) {
      usedPorts.add(s.configuredPort);
      if (s.actualPort) usedPorts.add(s.actualPort);
    }
    while (usedPorts.has(nextPort)) nextPort++;
    return nextPort++;
  }

  function registerDeclared(declared: DeclaredServer): void {
    if (servers.has(declared.id)) return;
    const state: ServerState = {
      serverId: declared.id,
      name: declared.name,
      filePath: declared.filePath,
      relativePath: declared.relativePath,
      configuredPort: allocateNextPort(),
      status: "declared",
      origin: "studio",
      routes: declared.routes.map((r) => ({ ...r })),
      collections: declared.collections.map((name) => ({ name, count: 0, records: [] })),
      scenarios: declared.scenarios,
      activeScenario: null,
    };
    servers.set(declared.id, state);
    emitServerState(state);
  }

  async function startServer(serverId: string): Promise<void> {
    const state = servers.get(serverId);
    if (!state || processManager.has(serverId)) return;

    updateAndEmit(serverId, { status: "starting", origin: "studio" });
    try {
      const spawned = await processManager.spawn(serverId, state.filePath, state.configuredPort);
      state.pid = spawned.pid;
    } catch (err) {
      updateAndEmit(serverId, {
        status: "crashed",
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function stopServer(serverId: string): Promise<void> {
    if (!servers.has(serverId)) return;
    updateAndEmit(serverId, { status: "stopping" });
    await processManager.kill(serverId);
    updateAndEmit(serverId, { status: "stopped", pid: undefined });
  }

  async function restartServer(serverId: string): Promise<void> {
    updateAndEmit(serverId, { status: "restarting" });
    await processManager.kill(serverId);
    await startServer(serverId);
  }

  return { registerDeclared, startServer, stopServer, restartServer };
}
