import { createLogger } from "../logger";
import type { WSAuthParams } from "../realtime/ws/ws-credentials";
import { decodeMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import type { WSInbox } from "./ws-inbox";

const log = createLogger("WS");

/** What a connection is admitted with: the client's `ws.auth`, or an `auth` frame no client sends. */
export type Admission = { readonly auth: WSAuthParams | undefined } | { readonly invalid: true };

/**
 * Wait for the first frame a client sends, and take it as the credentials
 * its connection is made with when it is an `auth` frame: its headers on
 * the connection's request, its `auth` for `onConnect`. A Courier client
 * sends one as soon as its socket opens; one that sends none within
 * `timeoutMs`, or another frame first, is admitted on its handshake alone.
 *
 * @param ctx - The connection
 * @param inbox - What its socket has sent
 * @param timeoutMs - How long to wait for the first frame
 * @returns The `auth` it was admitted with, or that its frame was not one a client sends
 * @example
 * ```ts
 * const admission = await awaitCredentials(ctx, inbox, 3000);
 * ```
 */
export async function awaitCredentials(
  ctx: WSSocketContext,
  inbox: WSInbox,
  timeoutMs: number,
): Promise<Admission> {
  const raw = await inbox.first(timeoutMs);
  ctx.credentialed = true;
  if (raw === undefined || raw.length > ctx.maxMessageSize) return { auth: undefined };
  const payload = authPayloadOf(raw);
  if (payload === NOT_AUTH) return { auth: undefined };
  inbox.takeFirst();
  const credentials = frameCredentials(payload);
  const request = credentials && withFrameHeaders(ctx.handshake, credentials);
  if (credentials === undefined || request === undefined) return { invalid: true };
  ctx.request = request;
  return { auth: credentials.auth };
}

/**
 * Take an `auth` frame as the credentials of a connection admitted without
 * waiting for it — on a handler with no `onConnect` to read them — so its
 * subscriptions are made with the frame's headers.
 *
 * @param ctx - The connection
 * @param payload - The frame's payload
 * @example
 * ```ts
 * applyFrameCredentials(ctx, msg.payload);
 * ```
 */
export function applyFrameCredentials(ctx: WSSocketContext, payload: unknown): void {
  const credentials = frameCredentials(payload);
  const request = credentials && withFrameHeaders(ctx.handshake, credentials);
  if (request === undefined) {
    log.warn(`An auth frame no client sends was ignored (conn=${ctx.connectionId})`);
    ctx.sendMessage({ type: "error", error: { code: 4400, message: "Invalid auth frame" } });
    return;
  }
  ctx.request = request;
}

const NOT_AUTH = Symbol("not an auth frame");

function authPayloadOf(raw: string): unknown {
  try {
    const msg = decodeMessage(raw);
    return msg.type === "auth" ? msg.payload : NOT_AUTH;
  } catch {
    return NOT_AUTH;
  }
}
