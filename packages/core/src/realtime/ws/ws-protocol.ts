/**
 * Wire protocol for WebSocket message framing.
 * Defines the message envelope used for all WS communication.
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
  | "auth"
  | "auth_required";

const VALID_TYPES = new Set<WSMessageType>([
  "subscribe",
  "unsubscribe",
  "data",
  "message",
  "ping",
  "pong",
  "error",
  "subscribed",
  "unsubscribed",
  "auth",
  "auth_required",
]);

export interface WSMessage {
  id?: string;
  type: WSMessageType;
  source?: string;
  topic?: string;
  payload?: unknown;
  seq?: number;
  error?: { code: number; message: string };
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

  const { type } = parsed as { type: unknown };

  if (typeof type !== "string" || !VALID_TYPES.has(type as WSMessageType)) {
    throw new Error(`WS protocol: invalid type '${String(type)}'`);
  }
}
