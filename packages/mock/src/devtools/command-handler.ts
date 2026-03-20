import type { BridgeContext, MockCommand } from "./types";

interface Socket {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

type CommandCallback = (result: { ok: boolean; error?: string; data?: unknown }) => void;

/**
 * Listen for mock:command events from DevTools UI and dispatch to server.
 * Returns a cleanup function.
 */
export function createCommandHandler(socket: Socket, ctx: BridgeContext): () => void {
  const handler = (command: unknown, callback?: unknown) => {
    const cmd = command as MockCommand;
    const cb = typeof callback === "function" ? (callback as CommandCallback) : undefined;

    // Ignore commands for other servers
    if (cmd.serverId !== ctx.serverId) return;

    try {
      const result = dispatchCommand(ctx, cmd);
      cb?.({ ok: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cb?.({ ok: false, error: message });
    }
  };

  socket.on("mock:command", handler);
  return () => socket.off("mock:command", handler);
}

function dispatchCommand(ctx: BridgeContext, cmd: MockCommand): unknown {
  switch (cmd.action) {
    case "mock:store:create":
      return handleStoreCreate(ctx, cmd.collection, cmd.record);
    case "mock:store:update":
      return handleStoreUpdate(ctx, cmd.collection, cmd.id, cmd.data);
    case "mock:store:delete":
      return handleStoreDelete(ctx, cmd.collection, cmd.id);
    case "mock:store:seed":
      return handleStoreSeed(ctx, cmd.collection, cmd.count);
    case "mock:scenario:apply":
      return handleScenarioApply(ctx, cmd.scenario);
    case "mock:network:set":
      return handleNetworkSet(ctx, cmd.config);
    case "mock:server:reset":
      return handleServerReset(ctx);
    default:
      throw new Error(`Unknown command: ${(cmd as { action: string }).action}`);
  }
}

function handleStoreCreate(
  ctx: BridgeContext,
  collectionName: string,
  record: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.create(record);
}

function handleStoreUpdate(
  ctx: BridgeContext,
  collectionName: string,
  id: string | number,
  data: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.update((q) => q.where({ id } as Record<string, unknown>), { data });
}

function handleStoreDelete(
  ctx: BridgeContext,
  collectionName: string,
  id: string | number,
): boolean {
  const col = ctx.server.store.collection(collectionName);
  return col.delete((q) => q.where({ id } as Record<string, unknown>));
}

function handleStoreSeed(
  ctx: BridgeContext,
  collectionName: string,
  count: number,
): { seeded: number } {
  const col = ctx.server.store.collection(collectionName);
  col.clear();
  col.createMany(count, (i) => ({ id: i + 1 }) as Record<string, unknown>);
  return { seeded: count };
}

function handleScenarioApply(ctx: BridgeContext, scenarioName: string): { applied: string } {
  // Scenario switching requires access to scenarios map — delegated via server
  // For now, acknowledge the command; full wiring happens when server exposes scenario map
  void ctx;
  return { applied: scenarioName };
}

function handleNetworkSet(
  ctx: BridgeContext,
  _config: Record<string, unknown>,
): { updated: boolean } {
  // Network config update requires server mutation — not yet wired
  void ctx;
  return { updated: true };
}

function handleServerReset(ctx: BridgeContext): { reset: boolean } {
  ctx.server.store.reset();
  ctx.server.history.length = 0;
  ctx.requestCounter = 0;
  return { reset: true };
}
