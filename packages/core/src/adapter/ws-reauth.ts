import { createLogger } from "../logger";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { connectionMetaOf } from "./connection-meta-of";
import type { WSSocketContext } from "./ws-context";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import type { ConnectionRegistry, InternalConnectionRegistry } from "./ws-registry-types";

const log = createLogger("WS");

const REFUSED = { code: 4401, message: "Credentials rejected" } as const;

/**
 * Handle an `auth` frame on an admitted connection: the client proving who
 * it is again, as `sendAuthRequired` asked. `onReauth` reads the handshake
 * with the frame's headers on it, and the frame's `auth`, and returns the
 * connection's new metadata; from then on its subscriptions are made with
 * those headers, and the deadline `sendAuthRequired` set is lifted. A frame
 * it refuses — and every frame, on a handler with no `onReauth` to check it
 * — is answered with a 4401 error, and the deadline stands.
 *
 * @param ctx - The connection
 * @param msg - The `auth` frame
 * @example
 * ```ts
 * void handleReauth(ctx, { type: "auth", payload: { headers: { authorization: "Bearer t2" } } });
 * ```
 */
export async function handleReauth(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const credentials = frameCredentials(msg.payload);
  const request = credentials && withFrameHeaders(ctx.handshake, credentials);
  if (credentials === undefined || request === undefined) {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4400, message: "Invalid auth frame" },
    });
    return;
  }
  if (!ctx.onReauth) {
    /* Nothing checks the credentials, so they prove nothing: taken as they
       came, any frame lifted the deadline `sendAuthRequired` set. */
    log.warn(`Credentials refused (conn=${ctx.connectionId}): no onReauth checks them`);
    ctx.sendMessage({ type: "error", id: msg.id, error: REFUSED });
    return;
  }
  try {
    const meta = await ctx.onReauth({
      connectionId: ctx.connectionId,
      meta: ctx.meta,
      request,
      auth: credentials.auth,
    });
    if (ctx.closed) return;
    Object.assign(ctx.meta, connectionMetaOf(meta, "onReauth"));
    ctx.request = request;
    ctx.registry.updateMeta(ctx.connectionId, ctx.meta);
    liftAuthDeadline(ctx);
    ctx.sendMessage({ type: "auth", id: msg.id });
  } catch (err) {
    if (ctx.closed) return;
    log.warn(`Credentials rejected (conn=${ctx.connectionId})`, err);
    ctx.sendMessage({ type: "error", id: msg.id, error: REFUSED });
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
 * answers with its credentials asked for anew — its `ws.auth`, the headers
 * of its session. Unless they come in and `onReauth` accepts them within
 * `timeoutMs`, the connection is closed with 4401.
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
    entry.close(4401, "Auth timeout — credentials not sent again");
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
