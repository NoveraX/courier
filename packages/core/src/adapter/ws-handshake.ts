import { decodeMessage, PROTOCOL_VERSION, type WSMessage } from "../realtime/ws/ws-protocol";
import type { SessionClose } from "./ws-close";

/** A client's first frame, read: its `auth`, of the version spoken here, or why its connection is refused. */
export type FirstFrame = { readonly auth: WSMessage } | { readonly refused: SessionClose };

/** What `auth_ok` tells a client of the connection it was let in on. */
export interface AuthOkFields {
  /** The id of the `auth` frame it answers */
  readonly id?: string | undefined;
  /** The connection's id, which grants nothing */
  readonly connectionId: string;
  /** How often the server sends `ping`, and how long it waits for the `pong` */
  readonly heartbeat: { readonly intervalMs: number; readonly timeoutMs: number };
  /** The largest message the server reads, and the most subscriptions it holds */
  readonly limits: { readonly maxMessageSize: number; readonly maxSubscriptions: number };
}

/**
 * Read a client's first frame as the protocol has it: an `auth` that names
 * the version spoken here. One of another kind, or larger than the server
 * reads, an `auth` naming no version or another one, is refused with 1002
 * and why — a page left from an older build is told to reload rather than
 * retry. Every server of the protocol reads it with this, a mock's too.
 *
 * @param raw - The frame as the socket delivered it
 * @param maxMessageSize - The largest message the server reads
 * @returns The `auth` frame, or why the connection is refused
 * @example
 * ```ts
 * const first = readFirstFrame(raw, 65_536);
 * if ("refused" in first) closeWithNotice(ws, first.refused, false);
 * ```
 */
export function readFirstFrame(raw: string, maxMessageSize: number): FirstFrame {
  const first = raw.length > maxMessageSize ? undefined : decoded(raw);
  if (first?.type !== "auth") return mismatch("The first frame is auth");
  if (first.v === undefined) {
    return mismatch(`Protocol version ${PROTOCOL_VERSION} required: reload the page`);
  }
  if (first.v === PROTOCOL_VERSION) return { auth: first };
  const named = typeof first.v === "number" ? `, not ${first.v}` : "";
  return mismatch(`Protocol version ${PROTOCOL_VERSION} is spoken here${named}`);
}

/**
 * The frame that lets a client in: `auth_ok`, the server's first frame on
 * the socket, with the heartbeat it keeps and the limits it holds the
 * client to; sent again, with a later `auth` frame's id, for credentials
 * renewed.
 *
 * @param fields - The connection's id, the `auth` frame answered, the heartbeat and the limits
 * @returns The frame
 * @example
 * ```ts
 * ws.send(encodeMessage(authOkFrame({ id: "a1", connectionId, heartbeat, limits })));
 * ```
 */
export function authOkFrame(fields: AuthOkFields): WSMessage {
  const { id, connectionId, heartbeat, limits } = fields;
  return {
    type: "auth_ok",
    ...(id !== undefined && { id }),
    v: PROTOCOL_VERSION,
    connectionId,
    heartbeat: { intervalMs: heartbeat.intervalMs, timeoutMs: heartbeat.timeoutMs },
    limits: { maxMessageSize: limits.maxMessageSize, maxSubscriptions: limits.maxSubscriptions },
  };
}

function decoded(raw: string): WSMessage | undefined {
  try {
    return decodeMessage(raw);
  } catch {
    return undefined;
  }
}

function mismatch(reason: string): FirstFrame {
  return { refused: { kind: "version", reason } };
}
