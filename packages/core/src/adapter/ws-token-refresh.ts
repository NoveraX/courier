import { createLogger } from "../logger";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import type { InternalConnectionRegistry } from "./ws-registry";

const log = createLogger("WS");

/**
 * Handle an incoming "auth" message — client is refreshing its token.
 * Calls `config.onTokenRefresh` to validate the new token and update connection metadata.
 * On failure, disconnects the client with code 4401.
 */
export async function handleTokenRefresh(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const token = typeof msg.payload === "string" ? msg.payload : undefined;

  if (!token) {
    ctx.sendMessage({ type: "error", id: msg.id, error: { code: 4400, message: "Missing token" } });
    return;
  }

  if (!ctx.onTokenRefresh) {
    // No handler configured — accept silently (token stored in meta)
    ctx.meta.token = token;
    ctx.sendMessage({ type: "auth", id: msg.id });
    return;
  }

  try {
    const newMeta = await ctx.onTokenRefresh({
      connectionId: ctx.connectionId,
      token,
      meta: ctx.meta,
    });
    if (ctx.closed) return;

    // Update meta in context and registry
    Object.assign(ctx.meta, newMeta);
    ctx.registry.updateMeta(ctx.connectionId, ctx.meta);

    ctx.sendMessage({ type: "auth", id: msg.id });
  } catch (err) {
    if (ctx.closed) return;
    log.warn(`Token refresh rejected (conn=${ctx.connectionId})`, err);
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4401, message: "Token rejected" },
    });
  }
}

/**
 * Send an "auth_required" notification to a specific connection.
 * Optionally schedules a disconnect if the client doesn't refresh within timeout.
 *
 * @returns Cleanup function to cancel the timeout (call if client refreshes in time)
 */
export function sendAuthRequired(
  registry: InternalConnectionRegistry,
  connectionId: string,
  timeoutMs = 30_000,
): (() => void) | undefined {
  const entry = registry.getEntry(connectionId);
  if (!entry) return undefined;

  entry.sendRaw({ type: "auth_required" });

  if (timeoutMs <= 0) return undefined;

  const timer = setTimeout(() => {
    entry.close(4401, "Auth timeout — token not refreshed");
  }, timeoutMs);

  return () => clearTimeout(timer);
}
