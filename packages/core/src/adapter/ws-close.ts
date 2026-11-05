import type { WebSocketLike } from "../realtime/adapters";
import type { StreamFailure } from "../realtime/describe-failure";
import { WS_CODE } from "../realtime/ws/ws-codes";
import { encodeMessage, PROTOCOL_VERSION, type WSMessage } from "../realtime/ws/ws-protocol";
import { closeReason } from "./close-reason";

/**
 * Why the server closes a connection, which its code, its reason and the
 * frame sent just before them are worked out from, so the closing code
 * itself never names one.
 */
export type SessionClose =
  | { readonly kind: "host" }
  | { readonly kind: "origin" }
  | { readonly kind: "limit" }
  /** Given up for a newer connection of its key, over `maxConnectionsPerKey` */
  | { readonly kind: "evicted" }
  | { readonly kind: "flood" }
  /** Its first frame is no `auth` of the protocol version spoken here */
  | { readonly kind: "version"; readonly reason: string }
  /** No first frame came within `authTimeoutMs` */
  | { readonly kind: "no-auth-frame"; readonly timeoutMs: number }
  /** Its first `auth` carries credentials no client sends: headers HTTP cannot carry, or too many */
  | {
      readonly kind: "bad-auth-frame";
      /** The id of the `auth` frame refused */
      readonly id?: string | undefined;
    }
  | {
      readonly kind: "auth-refused";
      readonly failure: StreamFailure;
      /** The id of the `auth` frame refused */
      readonly id?: string | undefined;
    }
  | { readonly kind: "admission-timeout" }
  | {
      readonly kind: "reauth-refused";
      readonly failure: StreamFailure;
      /** The id of the `auth` frame refused */
      readonly id?: string | undefined;
    }
  | { readonly kind: "reauth-timeout" }
  | { readonly kind: "heartbeat-timeout" }
  | { readonly kind: "slow-consumer" }
  | { readonly kind: "internal" }
  | { readonly kind: "shutdown"; readonly retryAfterMs: number }
  | { readonly kind: "application"; readonly code: number; readonly reason: string };

/** A close as the socket sends it. */
export interface CloseFrame {
  readonly code: number;
  readonly reason: string;
}

/**
 * Whether a server may close a connection with a code: one RFC 6455
 * defines for an endpoint to send — 1000 to 1014 but 1004, 1005 and 1006,
 * which no endpoint sends — or one of 3000–4999, left to libraries and
 * applications. A socket refuses to send any other.
 *
 * @param code - The code
 * @returns Whether it may be sent
 * @example
 * ```ts
 * isSendableCloseCode(4001); // true
 * isSendableCloseCode(1012); // true, a restart
 * isSendableCloseCode(1006); // false
 * ```
 */
export function isSendableCloseCode(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  if (code >= 3000 && code <= 4999) return true;
  return code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006;
}

/* A refusal's own code where a close can carry it — a `RealtimeError` the
   hook threw on purpose, `ForbiddenError` (4403) — and 4401 otherwise. */
function refused(failure: StreamFailure, fallback: string): CloseFrame {
  const own = failure.code >= 4000 && failure.code <= 4999;
  return own
    ? { code: failure.code, reason: failure.message }
    : { code: WS_CODE.UNAUTHORIZED, reason: fallback };
}

/**
 * The code and reason a connection is closed with, for why it is, as the
 * protocol's table of codes gives them: what a client does on each is its
 * code's to say.
 *
 * @param why - Why it is closed
 * @returns The code and the reason
 * @example
 * ```ts
 * closeOf({ kind: "evicted" }); // { code: 4409, reason: "Replaced by a newer connection" }
 * ```
 */
export function closeOf(why: SessionClose): CloseFrame {
  switch (why.kind) {
    case "host":
      return { code: WS_CODE.HOST_NOT_ALLOWED, reason: "Host not allowed" };
    case "origin":
      return { code: WS_CODE.FORBIDDEN, reason: "Origin not allowed" };
    case "limit":
      return { code: WS_CODE.TOO_MANY, reason: "Too many connections" };
    case "evicted":
      return { code: WS_CODE.REPLACED, reason: "Replaced by a newer connection" };
    case "flood":
      return {
        code: WS_CODE.TOO_MANY,
        reason: "Too many messages before the connection was accepted",
      };
    case "version":
      return { code: WS_CODE.PROTOCOL_MISMATCH, reason: why.reason };
    case "no-auth-frame":
      return { code: WS_CODE.TIMEOUT, reason: `No auth frame within ${why.timeoutMs} ms` };
    case "bad-auth-frame":
      return { code: WS_CODE.UNAUTHORIZED, reason: "Invalid auth frame" };
    case "auth-refused":
      return refused(why.failure, "Connection rejected");
    case "admission-timeout":
      return { code: WS_CODE.INTERNAL_ERROR, reason: "Connection could not be admitted in time" };
    case "reauth-refused":
      return refused(why.failure, "Credentials rejected");
    case "reauth-timeout":
      return { code: WS_CODE.UNAUTHORIZED, reason: "Credentials not renewed in time" };
    case "heartbeat-timeout":
      return { code: WS_CODE.TIMEOUT, reason: "Heartbeat timeout" };
    case "slow-consumer":
      return { code: WS_CODE.TRY_AGAIN_LATER, reason: "Slow consumer" };
    case "internal":
      return { code: WS_CODE.INTERNAL_ERROR, reason: "Internal error" };
    case "shutdown":
      return { code: WS_CODE.GOING_AWAY, reason: "Server shutting down" };
    case "application":
      return { code: why.code, reason: why.reason };
  }
}

/**
 * The frame that tells a client why it is closed, sent just before the
 * close: `auth_error` while it has not been let in, and for credentials it
 * sent again that were refused; `disconnect` once it has been. A stopping
 * server says when to come back.
 *
 * @param why - Why it is closed
 * @param close - The code and reason it is closed with
 * @param admitted - Whether the client was sent `auth_ok`
 * @returns The frame
 * @example
 * ```ts
 * noticeOf({ kind: "heartbeat-timeout" }, closeOf(why), true);
 * // { type: "disconnect", code: 4408, reason: "Heartbeat timeout" }
 * ```
 */
export function noticeOf(why: SessionClose, close: CloseFrame, admitted: boolean): WSMessage {
  const { code, reason } = close;
  const later = why.kind === "shutdown" ? { retryAfterMs: why.retryAfterMs } : {};
  if (admitted && why.kind !== "reauth-refused")
    return { type: "disconnect", code, reason, ...later };
  const id = "id" in why ? why.id : undefined;
  return {
    type: "auth_error",
    ...(id !== undefined && { id }),
    error: { code, message: reason },
    v: PROTOCOL_VERSION,
    ...later,
  };
}

/**
 * Close a socket for why, the frame that says why sent just before the
 * close: the protocol's one way for a server to end a connection, which a
 * server holding its own sockets — a mock's — closes them with too. The
 * reason is cut to what a close frame carries, in the frame before it as
 * well; a socket that no longer takes frames is closed all the same.
 *
 * @param ws - The socket
 * @param why - Why it is closed
 * @param admitted - Whether its client was sent `auth_ok`
 * @returns The code and reason it was closed with
 * @example
 * ```ts
 * closeWithNotice(ws, { kind: "no-auth-frame", timeoutMs: 3000 }, false);
 * ```
 */
export function closeWithNotice(
  ws: WebSocketLike,
  why: SessionClose,
  admitted: boolean,
): CloseFrame {
  const frame = closeOf(why);
  const said = { code: frame.code, reason: closeReason(frame.reason) };
  if (ws.readyState === 1) {
    try {
      ws.send(encodeMessage(noticeOf(why, said, admitted)));
    } catch {
      /* The close says it all the same. */
    }
  }
  ws.close(said.code, said.reason);
  return said;
}
