import { createLogger } from "../logger";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import type { ConnectionRegistry, InternalConnectionRegistry } from "./ws-registry-types";

const log = createLogger("WS");

/**
 * Handle an incoming "auth" message — client is refreshing its token.
 * Calls `config.onTokenRefresh` to validate the new token and update connection metadata.
 * An accepted token lifts the deadline `sendAuthRequired` set, which used to
 * close the connection at the timeout even after the client had answered.
 * A rejected one is answered with a 4401 error, and the deadline stands.
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
    liftAuthDeadline(ctx);
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
    liftAuthDeadline(ctx);

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

function liftAuthDeadline(ctx: WSSocketContext): void {
  const entry = ctx.registry.getEntry(ctx.connectionId);
  if (!entry) return;
  clearTimeout(entry.authDeadline);
  entry.authDeadline = undefined;
}

/**
 * Send an "auth_required" notification to a specific connection, which
 * answers with a fresh token from its `getAuthToken`. Unless the token comes
 * in and `onTokenRefresh` accepts it within `timeoutMs`, the connection is
 * closed with 4401.
 *
 * @param registry - The handler's `connections`
 * @param connectionId - The connection to ask
 * @param timeoutMs - How long it has to answer; 0 sets no deadline
 * @returns Cleanup function to cancel the deadline, or nothing when there is none
 *
 * @example
 * sendAuthRequired(handler.connections, connectionId, 10_000);
 */
export function sendAuthRequired(
  registry: ConnectionRegistry,
  connectionId: string,
  timeoutMs = 30_000,
): (() => void) | undefined {
  const entry = isInternal(registry) ? registry.getEntry(connectionId) : undefined;
  if (!entry) return undefined;

  entry.sendRaw({ type: "auth_required" });

  if (timeoutMs <= 0) return undefined;

  clearTimeout(entry.authDeadline);
  const deadline = setTimeout(() => {
    entry.authDeadline = undefined;
    entry.close(4401, "Auth timeout — token not refreshed");
  }, timeoutMs);
  entry.authDeadline = deadline;

  return () => {
    clearTimeout(deadline);
    if (entry.authDeadline === deadline) entry.authDeadline = undefined;
  };
}

/** Whether the registry is one a WS handler made, which holds the connections themselves. */
function isInternal(registry: ConnectionRegistry): registry is InternalConnectionRegistry {
  return "getEntry" in registry && typeof registry.getEntry === "function";
}
