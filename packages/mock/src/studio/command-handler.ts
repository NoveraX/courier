import { dispatchCommand, STORE_MUTATIONS } from "./commands/dispatch";
import type { MockEventEmitter } from "./event-emitter";
import type { BridgeContext, MockCommand } from "./types";

interface Socket {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

type CommandCallback = (result: { ok: boolean; error?: string; data?: unknown }) => void;

/**
 * Listen for mock:command events from Studio UI and dispatch to server.
 * Returns a cleanup function.
 */
export function createCommandHandler(
  socket: Socket,
  ctx: BridgeContext,
  emitter: MockEventEmitter,
): () => void {
  const handler = async (command: unknown, callback?: unknown) => {
    const cmd = command as MockCommand;
    const cb = typeof callback === "function" ? (callback as CommandCallback) : undefined;

    if (cmd.serverId !== ctx.serverId) return;

    try {
      const result = await dispatchCommand(ctx, emitter, cmd);
      cb?.({ ok: true, data: result });

      if (STORE_MUTATIONS.has(cmd.action)) emitter.emitStoreSnapshot();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cb?.({ ok: false, error: message });
    }
  };

  socket.on("mock:command", handler);
  return () => socket.off("mock:command", handler);
}
