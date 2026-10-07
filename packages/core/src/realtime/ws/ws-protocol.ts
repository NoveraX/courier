/**
 * Wire protocol for WebSocket message framing.
 * Defines the message envelope used for all WS communication.
 */

/**
 * The kinds of frame. A client's first frame on every socket is `auth`, its
 * payload `{ headers?, auth? }` — the headers it could not put on the
 * handshake, and the caller's `ws.auth` — which the server admits the
 * connection on; `auth_required` asks the client to send it again, and an
 * `auth` with the same `id` accepts what it sent. The server answers a
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
  | "auth_required"
  | "renamed";

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
  "auth_required",
  "renamed",
]);

export interface WSMessage {
  id?: string | undefined;
  type: WSMessageType;
  source?: string;
  topic?: string;
  payload?: unknown;
  seq?: number;
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
