import type { WSAuthParams } from "../realtime/ws/ws-credentials";
import type { SessionClose } from "./ws-close";
import type { WSSocketContext } from "./ws-context";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import { readFirstFrame } from "./ws-handshake";
import type { WSInbox } from "./ws-inbox";

/**
 * What a connection is admitted with: the `auth` frame's id and the
 * client's `ws.auth`, or why it is refused before anything checks it.
 */
export type Admission =
  | { readonly id: string | undefined; readonly auth: WSAuthParams | undefined }
  | { readonly refused: SessionClose };

/**
 * Wait for the first frame a client sends, which is its `auth`, of the
 * protocol version spoken here: its headers go on the connection's
 * request, its `auth` to `onConnect`. A first frame of another kind, an
 * `auth` naming no version or another one, or none within `timeoutMs`, is
 * refused — the version with 1002 and why, so a page left from an older
 * build is told to reload rather than retry. It is read as it comes: a
 * first frame that is refused is refused for itself, whatever the client
 * sent after it, and nothing more is kept.
 *
 * @param ctx - The connection
 * @param inbox - What its socket has sent
 * @param timeoutMs - How long to wait for the first frame
 * @returns What it is admitted with, or why it is refused
 * @example
 * ```ts
 * const admission = await awaitCredentials(ctx, inbox, 3000);
 * if ("refused" in admission) ctx.session.close(admission.refused);
 * ```
 */
export function awaitCredentials(
  ctx: WSSocketContext,
  inbox: WSInbox,
  timeoutMs: number,
): Promise<Admission> {
  return new Promise((resolve) => {
    inbox.first(timeoutMs, (raw) => {
      const admission: Admission =
        raw === undefined ? { refused: { kind: "no-auth-frame", timeoutMs } } : admitted(ctx, raw);
      resolve(admission);
      return !("refused" in admission);
    });
  });
}

/* What a first frame admits its connection with; its headers go on the connection's request. */
function admitted(ctx: WSSocketContext, raw: string): Admission {
  const first = readFirstFrame(raw, ctx.maxMessageSize);
  if ("refused" in first) return first;
  const id = typeof first.auth.id === "string" ? first.auth.id : undefined;
  const credentials = frameCredentials(first.auth.payload);
  const request = credentials && withFrameHeaders(ctx.handshake, credentials);
  if (credentials === undefined || request === undefined) {
    return { refused: { kind: "bad-auth-frame", id } };
  }
  ctx.request = request;
  return { id, auth: credentials.auth };
}
