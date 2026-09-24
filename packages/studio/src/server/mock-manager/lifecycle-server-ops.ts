/**
 * Start, stop, restart and removal of managed mocks, kept in step with their
 * `ServerState`.
 *
 * Operations on one mock run one after another, each seeing what the one
 * before it left: a stop that arrives while a start or restart is still
 * underway stops the worker that start forked, rather than racing it and
 * leaving it running. Once Studio closes, nothing starts again.
 */

import { allocatePort } from "./port-allocator";
import type { ProcessManager, ServerState } from "./types";

export interface ServerOpsContext {
  servers: Map<string, ServerState>;
  processManager: ProcessManager;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  /** Ports the config declares; a port Studio assigns keeps clear of them. */
  reservedPorts: () => Iterable<number>;
  isClosed: () => boolean;
}

export interface ServerOps {
  startServer: (serverId: string) => Promise<void>;
  stopServer: (serverId: string) => Promise<void>;
  restartServer: (serverId: string) => Promise<void>;
  /** Stop a mock, then forget it; `onRemoved` runs once it is gone. */
  removeServer: (serverId: string, onRemoved: () => void) => Promise<void>;
  /** Resolves once every operation queued so far has finished. */
  settled: () => Promise<void>;
}

const NOT_RUNNING: Partial<ServerState> = { pid: undefined, actualPort: undefined, url: undefined };

export function createServerOps(ctx: ServerOpsContext): ServerOps {
  const { servers, processManager, updateAndEmit } = ctx;
  const queues = new Map<string, Promise<void>>();

  function enqueue(serverId: string, operation: () => Promise<void>): Promise<void> {
    const previous = queues.get(serverId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const clear = () => {
      if (queues.get(serverId) === run) queues.delete(serverId);
    };
    run.then(clear, clear);
    queues.set(serverId, run);
    return run;
  }

  /** A free port for a mock whose port Studio assigns, clear of every other mock's. */
  async function portToListenOn(state: ServerState): Promise<number> {
    if (state.portDeclared) return state.configuredPort;
    const avoid = new Set<number>(ctx.reservedPorts());
    for (const other of servers.values()) {
      if (other === state) continue;
      avoid.add(other.configuredPort);
      if (other.actualPort) avoid.add(other.actualPort);
    }
    return allocatePort(state.configuredPort, avoid);
  }

  async function start(serverId: string): Promise<void> {
    const state = servers.get(serverId);
    if (ctx.isClosed() || !state || processManager.has(serverId)) return;
    updateAndEmit(serverId, { status: "starting", origin: "studio", lastError: undefined });
    try {
      const port = await portToListenOn(state);
      if (ctx.isClosed()) return;
      const { mocksFile, mockKey } = state;
      state.pid = processManager.spawn({ serverId, mocksFile, mockKey, port }).pid;
    } catch (err) {
      updateAndEmit(serverId, {
        status: "crashed",
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function stop(serverId: string): Promise<void> {
    if (!servers.has(serverId) || !processManager.has(serverId)) return;
    updateAndEmit(serverId, { status: "stopping" });
    await processManager.kill(serverId);
    updateAndEmit(serverId, { status: "stopped", ...NOT_RUNNING });
  }

  /* Only a mock that is running restarts: one stopped by the time its turn
     comes stays stopped. */
  async function restart(serverId: string): Promise<void> {
    if (ctx.isClosed() || !servers.has(serverId) || !processManager.has(serverId)) return;
    updateAndEmit(serverId, { status: "restarting" });
    await processManager.kill(serverId);
    updateAndEmit(serverId, NOT_RUNNING);
    await start(serverId);
  }

  return {
    startServer: (serverId) => enqueue(serverId, () => start(serverId)),
    stopServer: (serverId) => enqueue(serverId, () => stop(serverId)),
    restartServer: (serverId) => enqueue(serverId, () => restart(serverId)),
    removeServer: (serverId, onRemoved) =>
      enqueue(serverId, async () => {
        await stop(serverId);
        servers.delete(serverId);
        onRemoved();
      }),
    settled: async () => {
      while (queues.size > 0) await Promise.allSettled([...queues.values()]);
    },
  };
}
