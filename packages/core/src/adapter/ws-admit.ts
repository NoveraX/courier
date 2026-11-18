import type { WSAuthParams } from "../realtime/ws/ws-credentials";
import type { SessionClose } from "./ws-close";
import type { WSSocketContext } from "./ws-context";
import { frameCredentials, withFrameHeaders } from "./ws-frame-credentials";
import { type FirstFrame, readFirstFrame } from "./ws-handshake";
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
 * sent after it, and nothing more is kept. A `ping` before it — a client
 * checking that its WebSocket gets through — is answered with `pong`, and
 * the `auth` is waited for in what is left of `timeoutMs`.
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
  const until = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const read = (raw: string | undefined): boolean => {
      const first = raw === undefined ? undefined : readFirstFrame(raw, ctx.maxMessageSize);
      if (first !== undefined && "ping" in first) {
        ctx.sendMessage({ type: "pong" });
        inbox.first(Math.max(0, until - performance.now()), read);
        return true;
      }
      const admission: Admission =
        first === undefined
          ? { refused: { kind: "no-auth-frame", timeoutMs } }
          : admitted(ctx, first);
      resolve(admission);
      return !("refused" in admission);
    };
    inbox.first(timeoutMs, read);
  });
}

/* What a first frame admits its connection with; its headers go on the connection's request. */
function admitted(
  ctx: WSSocketContext,
  first: Exclude<FirstFrame, { readonly ping: true }>,
): Admission {
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
