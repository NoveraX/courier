import { createLogger } from "../logger";
import { describeFailure, type StreamFailure } from "../realtime/describe-failure";
import { WS_CODE } from "../realtime/ws/ws-codes";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { connectionMetaOf } from "./connection-meta-of";
import { closeOf, type SessionClose } from "./ws-close";
import { connectionFields } from "./ws-connection-fields";
import type { WSSocketContext } from "./ws-context";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import { reauthorizeSubscriptions } from "./ws-reauthorize";

const log = createLogger("WS");

const TIMED_OUT = Symbol("onReauth did not settle in time");

/**
 * Handle an `auth` frame on an admitted connection: the client proving who
 * it is again, as `connections.requireAuth` asked, or of itself. `onReauth` reads
 * the handshake with the frame's headers on it, and the frame's `auth`, and
 * returns the connection's new metadata; from then on its subscriptions are
 * made with those headers, the deadline `connections.requireAuth` set is lifted,
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
      error: { code: WS_CODE.BAD_REQUEST, message: "Invalid auth frame" },
    });
    return;
  }
  const onReauth = ctx.onReauth;
  if (!onReauth) {
    refuse(
      ctx,
      msg,
      { code: WS_CODE.UNAUTHORIZED, message: "Credentials cannot be renewed on this connection" },
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
        failure: {
          code: WS_CODE.UNAUTHORIZED,
          message: "Credentials could not be checked in time",
        },
        id: msg.id,
      });
      return;
    }
    next = connectionMetaOf(result, "onReauth");
  } catch (error) {
    if (!ctx.closed)
      refuse(ctx, msg, describeFailure(error, "Credentials rejected", WS_CODE.UNAUTHORIZED), error);
    return;
  } finally {
    clearTimeout(timer);
  }
  const changed = Object.entries(next).some(([field, value]) => !Object.is(ctx.meta[field], value));
  Object.assign(ctx.meta, next);
  ctx.request = request;
  ctx.registry.updateMeta(ctx.connectionId, ctx.meta);
  ctx.session.credentialsRenewed(msg.id);
  if (changed) await reauthorizeSubscriptions(ctx);
}

/* Logged on one line with what was thrown, and closed at once with the
   refusal's code, after `auth_error` naming the frame refused: no deadline
   is left for a client that was turned down. */
function refuse(
  ctx: WSSocketContext,
  msg: WSMessage,
  failure: StreamFailure,
  cause: unknown,
): void {
  const why: SessionClose = { kind: "reauth-refused", failure, id: msg.id };
  const { code } = closeOf(why);
  ctx.refusals.warn({ event: "credentials refused", code, fields: connectionFields(ctx) }, cause);
  ctx.session.close(why);
}
