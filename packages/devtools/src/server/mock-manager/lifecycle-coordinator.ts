import { createProcessManager } from "./process-manager";
import type { DeclaredServer } from "./scanner";
import { createScanner } from "./scanner";
import type { CoordinatorConfig, ServerState } from "./types";
import { createUiEmitter } from "./ui-emitter";

export function createLifecycleCoordinator(config: CoordinatorConfig) {
  const servers = new Map<string, ServerState>();
  let nextPort = config.basePort;
  const { emit, emitServerState } = createUiEmitter(config.uiNamespace);

  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    const state = servers.get(serverId);
    if (!state) return;
    Object.assign(state, patch);
    emitServerState(state);
  };

  // ── Process Manager ──────────────────────────────────────────────────────

  const processManager = createProcessManager({
    onReady(serverId, data) {
      const name = servers.get(serverId)?.name ?? serverId;
      console.log(`  ✦ Mock server "${name}" running at ${data.url}`);
      updateAndEmit(serverId, {
        status: "running",
        actualPort: data.port,
        url: data.url,
        startedAt: Date.now(),
        routes: data.routes,
        collections: data.collections,
      });
    },
    onError(serverId, message, fatal) {
      if (fatal) updateAndEmit(serverId, { status: "crashed", lastError: message });
    },
    onStopped(serverId) {
      updateAndEmit(serverId, { status: "stopped", pid: undefined });
    },
    onCrashed(serverId, code) {
      updateAndEmit(serverId, {
        status: "crashed",
        lastError: `Process exited with code ${code}`,
        pid: undefined,
      });
    },
    onEvent(serverId, event) {
      emit(event.type as string, { ...event, serverId });
    },
  });

  // ── Scanner ──────────────────────────────────────────────────────────────

  const scanner = createScanner(config.mocksDir, {
    onDeclared(declared) {
      registerDeclared(declared);
      if (declared.autoStart) void startServer(declared.id);
    },
    onChanged(declared) {
      const state = servers.get(declared.id);
      if (state && state.status === "running") void restartServer(declared.id);
    },
    onRemoved(serverId) {
      void stopServer(serverId);
      servers.delete(serverId);
      emit("mock:server:disconnect", { serverId });
    },
  });

  // ── Server Management ────────────────────────────────────────────────────

  function registerDeclared(declared: DeclaredServer): void {
    if (servers.has(declared.id)) return;
    const state: ServerState = {
      serverId: declared.id,
      name: declared.name,
      filePath: declared.filePath,
      relativePath: declared.relativePath,
      configuredPort: nextPort++,
      status: "declared",
      origin: "devtools",
      routes: declared.routes.map((r) => ({ ...r })),
      collections: declared.collections.map((name) => ({ name, count: 0 })),
    };
    servers.set(declared.id, state);
    emitServerState(state);
  }

  async function startServer(serverId: string): Promise<void> {
    const state = servers.get(serverId);
    if (!state || processManager.has(serverId)) return;

    updateAndEmit(serverId, { status: "starting", origin: "devtools" });
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

  // ── Public API ───────────────────────────────────────────────────────────

  function handleCommand(command: string, data: Record<string, unknown>): void {
    const serverId = data.serverId as string;
    switch (command) {
      case "mock:managed:start":
        void startServer(serverId);
        break;
      case "mock:managed:stop":
        void stopServer(serverId);
        break;
      case "mock:managed:restart":
        void restartServer(serverId);
        break;
      case "mock:managed:startAll":
        for (const id of servers.keys()) void startServer(id);
        break;
      case "mock:managed:stopAll":
        for (const id of servers.keys()) void stopServer(id);
        break;
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
    sendSnapshot,
  };
}

export type LifecycleCoordinator = ReturnType<typeof createLifecycleCoordinator>;
