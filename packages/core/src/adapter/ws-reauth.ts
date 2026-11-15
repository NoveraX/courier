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
import type { ReauthDeadline } from "./ws-session";

const log = createLogger("WS");

const TIMED_OUT = Symbol("onReauth did not settle in time");

/**
 * Handle an `auth` frame on an admitted connection: the client proving who
 * it is again, as `connections.requireAuth` asked, or of itself. `onReauth` reads
 * the handshake with the frame's headers on it, and the frame's `auth`, and
 * returns the connection's new metadata, which replaces the old whole; from
 * then on its subscriptions are made with those headers, the deadline
 * `connections.requireAuth` set is lifted, and `authorize` runs again for
 * each subscription it holds when who it is changed — a field added,
 * removed or given another value. Credentials `onReauth` refuses close the connection at once —
 * and so does any, on a handler with no `onReauth` to check them: the
 * connection holds on to nothing it was not shown to be.
 *
 * A connection's frames are checked one at a time, in the order they came,
 * so the credentials it sent last are the ones it holds. A frame answers the
 * deadline in force when it came: one set while it waited or was checked
 * stands, and is asked for again once its credentials are taken.
 *
 * @param ctx - The connection
 * @param msg - The `auth` frame
 * @returns Settles once the frame is checked, after those that came before it
 * @example
 * ```ts
 * void handleReauth(ctx, { type: "auth", payload: { headers: { authorization: "Bearer t2" } } });
 * ```
 */
export function handleReauth(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const answered = ctx.session.deadline;
  const checked = ctx.reauthing.then(() => renew(ctx, msg, answered));
  /* The next frame waits for this one whatever came of it: what it threw is its caller's to log. */
  ctx.reauthing = checked.catch(() => undefined);
  return checked;
}

async function renew(
  ctx: WSSocketContext,
  msg: WSMessage,
  answered: ReauthDeadline | undefined,
): Promise<void> {
  /* A connection closing by its turn — a frame before it refused — checks no more. */
  if (ctx.session.closing) return;
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
  const changed = !sameFields(ctx.meta, next);
  ctx.meta = next;
  ctx.request = request;
  ctx.registry.updateMeta(ctx.connectionId, ctx.meta);
  ctx.session.credentialsRenewed(msg.id, answered);
  if (changed) await reauthorizeSubscriptions(ctx);
}

/* Whether two metadata hold the same fields with the same values: one added,
   removed or changed makes the connection someone else. */
function sameFields(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const fields = Object.keys(before);
  if (fields.length !== Object.keys(after).length) return false;
  return fields.every(
    (field) => Object.hasOwn(after, field) && Object.is(before[field], after[field]),
  );
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
