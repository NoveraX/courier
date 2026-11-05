import { createLogger } from "../logger";
import { describeFailure, type StreamFailure } from "../realtime/describe-failure";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { connectionMetaOf } from "./connection-meta-of";
import { connectionFields } from "./ws-connection-fields";
import type { WSSocketContext } from "./ws-context";
import type { SessionClose } from "./ws-dialect";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import { reauthorizeSubscriptions } from "./ws-reauthorize";
import type { ConnectionRegistry, InternalConnectionRegistry } from "./ws-registry-types";

const log = createLogger("WS");

const TIMED_OUT = Symbol("onReauth did not settle in time");

/**
 * Handle an `auth` frame on an admitted connection: the client proving who
 * it is again, as `sendAuthRequired` asked, or of itself. `onReauth` reads
 * the handshake with the frame's headers on it, and the frame's `auth`, and
 * returns the connection's new metadata; from then on its subscriptions are
 * made with those headers, the deadline `sendAuthRequired` set is lifted,
 * and each subscription it holds is authorized again when who it is
 * changed. Credentials `onReauth` refuses close the connection at once —
 * and so does any, on a handler with no `onReauth` to check them: the
 * connection holds on to nothing it was not shown to be.
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
  const onReauth = ctx.onReauth;
  if (!onReauth) {
    refuse(
      ctx,
      { code: 4401, message: "Credentials cannot be renewed on this connection" },
      "no onReauth checks them",
    );
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let next: Record<string, unknown>;
  try {
    const { connectionId, meta } = ctx;
    const result = await Promise.race([
      Promise.resolve(onReauth({ connectionId, meta, request, auth: credentials.auth })),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ctx.middlewareTimeoutMs);
      }),
    ]);
    if (ctx.closed) return;
    if (result === TIMED_OUT) {
      log.error(
        `onReauth did not settle within ${ctx.middlewareTimeoutMs} ms (conn=${connectionId})`,
      );
      ctx.session.close({
        kind: "reauth-refused",
        failure: { code: 4401, message: "Credentials could not be checked in time" },
      });
      return;
    }
    next = connectionMetaOf(result, "onReauth");
  } catch (error) {
    if (!ctx.closed) refuse(ctx, describeFailure(error, "Credentials rejected", 4401), error);
    return;
  } finally {
    clearTimeout(timer);
  }
  const changed = Object.entries(next).some(([field, value]) => !Object.is(ctx.meta[field], value));
  Object.assign(ctx.meta, next);
  ctx.request = request;
  ctx.registry.updateMeta(ctx.connectionId, ctx.meta);
  ctx.session.credentialsRenewed();
  ctx.sendMessage(ctx.session.dialect.reauthAccepted(msg.id));
  if (changed) await reauthorizeSubscriptions(ctx);
}

/* Logged on one line with what was thrown, and closed at once with the
   refusal's code: no deadline is left for a client that was turned down. */
function refuse(ctx: WSSocketContext, failure: StreamFailure, cause: unknown): void {
  const why: SessionClose = { kind: "reauth-refused", failure };
  const { code } = ctx.session.dialect.closeOf(why);
  ctx.refusals.warn({ event: "credentials refused", code, fields: connectionFields(ctx) }, cause);
  ctx.session.close(why);
}

/**
 * Ask a connection for its credentials again: it is sent `auth_required`,
 * and answers with its credentials asked for anew — its `ws.auth`, the
 * headers of its session. Unless they come in and `onReauth` accepts them
 * within `timeoutMs` — the handler's `authRequiredTimeoutMs` when not
 * given — the connection is closed with 4401.
 *
 * @param registry - The handler's `connections`
 * @param connectionId - The connection to ask
 * @param timeoutMs - How long it has to answer; 0 sets no deadline
 * @returns Cleanup function to cancel the deadline, or nothing when the connection is not this replica's
 *
 * @example
 * sendAuthRequired(handler.connections, connectionId, 10_000);
 */
export function sendAuthRequired(
  registry: ConnectionRegistry,
  connectionId: string,
  timeoutMs?: number,
): (() => void) | undefined {
  const entry = isInternal(registry) ? registry.getEntry(connectionId) : undefined;
  return entry?.requireAuth(timeoutMs);
}

/** Whether the registry is one a WS handler made, which holds the connections themselves. */
function isInternal(registry: ConnectionRegistry): registry is InternalConnectionRegistry {
  return "getEntry" in registry && typeof registry.getEntry === "function";
}
