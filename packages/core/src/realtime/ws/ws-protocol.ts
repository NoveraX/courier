/**
 * Wire protocol for WebSocket message framing.
 * Defines the message envelope used for all WS communication.
 */

/** The version of the protocol a client's first `auth` names, and `auth_ok` and `auth_error` answer with. */
export const PROTOCOL_VERSION = 2;

/**
 * The kinds of frame. A client's first frame on every socket is `auth`,
 * with `v`, the protocol version it speaks, and its payload
 * `{ headers?, auth? }` — the headers it could not put on the handshake,
 * and the caller's `ws.auth` — which the server admits the connection on,
 * answering `auth_ok`, or `auth_error` just before it closes the socket.
 * The server's first frame is always one of those, or `disconnect`, which
 * precedes every close once the connection is admitted. `reauth_required`
 * asks the client to send its credentials again, in an `auth` that `auth_ok`
 * with the same `id` accepts. The server answers a
 * `subscribe` carrying an `id` with
 * `subscribed` once the subscription is running, or `complete` with an
 * `error` when it refuses it — both with that `id`. When it subscribes the
 * connection under another topic than the one asked for, because it
 * qualifies the topic from the variables its schema produced, it first sends
 * `renamed`: `topic` is the one asked for and `payload` the one everything
 * about the subscription comes on from then on.
 */
export type WSMessageType =
  | "subscribe"
  | "unsubscribe"
  | "data"
  | "message"
  | "ping"
  | "pong"
  | "error"
  | "subscribed"
  | "unsubscribed"
  | "complete"
  | "auth"
  | "auth_ok"
  | "auth_error"
  | "reauth_required"
  | "disconnect"
  | "renamed"
  | "skip"
  | "resync";

const VALID_TYPES: ReadonlySet<string> = new Set<WSMessageType>([
  "subscribe",
  "unsubscribe",
  "data",
  "message",
  "ping",
  "pong",
  "error",
  "subscribed",
  "unsubscribed",
  "complete",
  "auth",
  "auth_ok",
  "auth_error",
  "reauth_required",
  "disconnect",
  "renamed",
  "skip",
  "resync",
]);

export interface WSMessage {
  id?: string | undefined;
  type: WSMessageType;
  source?: string;
  topic?: string;
  payload?: unknown;
  /** On an event of a topic, and on `skip`, `resync` and `subscribed`: its number in the topic's sequence */
  seq?: number;
  /** On `subscribed` and `resync`: the name of the topic's sequence the numbers belong to */
  epoch?: string;
  /** On `subscribe`: the position the client counted, to resume from */
  since?: { seq: number; epoch: string };
  /** On `subscribed` for a subscription that sent `since`: whether every event it missed was sent */
  recovered?: boolean;
  /** On a client's first `auth`: the version of the protocol it speaks. On `auth_ok` and `auth_error`: the server's */
  v?: number | undefined;
  /** On `auth_ok`: the connection's id, which grants nothing */
  connectionId?: string | undefined;
  /** On `auth_ok`: how often the server sends `ping`, and how long it waits for the `pong` */
  heartbeat?: { intervalMs: number; timeoutMs: number } | undefined;
  /** On `auth_ok`: the largest message the server reads, and the most subscriptions it holds */
  limits?: { maxMessageSize: number; maxSubscriptions: number } | undefined;
  /** On `reauth_required`: how long the client has to send its credentials again; 0 for no deadline */
  timeoutMs?: number | undefined;
  /** On `disconnect`: the code the socket is closed with */
  code?: number | undefined;
  /** On `disconnect`: why, as the client reads it */
  reason?: string | undefined;
  /** On `disconnect` and `auth_error`: how long to wait before coming back */
  retryAfterMs?: number | undefined;
  /**
   * On `error`: what went wrong. With a `topic`, it concerns that
   * subscription, which goes on. On `complete`: why the server ended the
   * subscription; absent when it simply finished.
   */
  error?: { code: number; message: string; issues?: readonly unknown[] };
}

/**
 * Serializes a WSMessage to a JSON string for transmission.
 * @param msg - The message to encode
 * @returns JSON string representation
 * @example encodeMessage({ type: "ping" }) // '{"type":"ping"}'
 */
export function encodeMessage(msg: WSMessage): string {
  return JSON.stringify(msg);
}

/**
 * Deserializes a raw JSON string into a validated WSMessage.
 * @param raw - The raw JSON string received from the wire
 * @returns Parsed and validated WSMessage
 * @throws Error if JSON is invalid, type field is missing, or type value is unknown
 * @example decodeMessage('{"type":"pong"}') // { type: "pong" }
 */
export function decodeMessage(raw: string): WSMessage {
  const parsed = safeParse(raw);
  validateType(parsed);
  return parsed as WSMessage;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`WS protocol: invalid JSON — ${raw.slice(0, 120)}`);
  }
}

function validateType(parsed: unknown): void {
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    throw new Error("WS protocol: missing 'type' field");
  }

  const { type } = parsed;

  if (typeof type !== "string" || !VALID_TYPES.has(type)) {
    throw new Error(`WS protocol: invalid type '${String(type)}'`);
  }
}
