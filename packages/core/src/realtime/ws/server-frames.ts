import { isRecord } from "../../utils/is-record";
import {
  isCode,
  isCount,
  isFrameError,
  isString,
  isWait,
  optional,
  positionOf,
} from "./frame-fields";
import type { FrameReading, ServerFrame } from "./server-frame-types";

type Reader = (fields: Record<string, unknown>) => ServerFrame | undefined;

/* The longest wait a timer keeps: a longer one runs out at once. */
const MAX_TIMER_MS = 2_147_483_647;

const READERS: Readonly<Record<string, Reader>> = {
  ping: () => ({ type: "ping" }),
  pong: () => ({ type: "pong" }),
  auth_ok: readAuthOk,
  auth_error: (f) => {
    if (!isFrameError(f.error) || !isCount(f.v)) return undefined;
    if (f.id !== undefined && !isString(f.id)) return undefined;
    const { error, v } = f;
    return optional(f.retryAfterMs, isWait, (retryAfterMs) => ({
      type: "auth_error",
      id: f.id as string | undefined,
      error,
      v,
      retryAfterMs,
    }));
  },
  reauth_required: (f) =>
    isWait(f.timeoutMs) && Number.isInteger(f.timeoutMs)
      ? { type: "reauth_required", timeoutMs: f.timeoutMs }
      : undefined,
  disconnect: (f) => {
    if (!isCode(f.code) || !isString(f.reason)) return undefined;
    const { code, reason } = f;
    return optional(f.retryAfterMs, isWait, (retryAfterMs) => ({
      type: "disconnect",
      code,
      reason,
      retryAfterMs,
    }));
  },
  renamed: (f) =>
    isString(f.topic) && isString(f.payload)
      ? { type: "renamed", topic: f.topic, to: f.payload }
      : undefined,
  subscribed: (f) => {
    const position = positionOf(f);
    if (!isString(f.topic) || position === undefined) return undefined;
    if (f.id !== undefined && !isString(f.id)) return undefined;
    if (f.recovered !== undefined && typeof f.recovered !== "boolean") return undefined;
    return { type: "subscribed", topic: f.topic, id: f.id, position, recovered: f.recovered };
  },
  unsubscribed: (f) => (isString(f.topic) ? { type: "unsubscribed", topic: f.topic } : undefined),
  complete: (f) =>
    isString(f.topic)
      ? optional(f.error, isFrameError, (error) => ({
          type: "complete",
          topic: f.topic as string,
          error,
        }))
      : undefined,
  data: (f) => {
    if (f.topic !== undefined && !isString(f.topic)) return undefined;
    if (f.seq !== undefined && !isCount(f.seq)) return undefined;
    return { type: "data", topic: f.topic, payload: f.payload, seq: f.seq };
  },
  skip: (f) =>
    isString(f.topic) && isCount(f.seq) ? { type: "skip", topic: f.topic, seq: f.seq } : undefined,
  resync: (f) => {
    const position = positionOf(f);
    return isString(f.topic) && position ? { type: "resync", topic: f.topic, position } : undefined;
  },
  error: (f) => {
    if (!isFrameError(f.error)) return undefined;
    const { error } = f;
    if (f.id !== undefined && !isString(f.id)) return undefined;
    if (f.topic !== undefined && !isString(f.topic)) return undefined;
    return { type: "error", id: f.id, topic: f.topic, error };
  },
};

/**
 * Read one message a socket received as a server's frame, checking each
 * field it is read by: a frame whose topic is not a string, or whose error
 * has no code, is not handed on as though it were whole.
 *
 * @param raw - The message's data
 * @returns The frame, or why there is none
 * @example
 * ```ts
 * readServerFrame('{"type":"subscribed","topic":"api.chat.room","id":"sub-1"}');
 * // → { frame: { type: "subscribed", topic: "api.chat.room", id: "sub-1" } }
 * ```
 */
export function readServerFrame(raw: unknown): FrameReading {
  if (typeof raw !== "string") return { invalid: "a binary message" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { invalid: "not JSON" };
  }
  if (!isRecord(parsed) || !isString(parsed.type)) return { invalid: "no type" };
  const read = Object.hasOwn(READERS, parsed.type) ? READERS[parsed.type] : undefined;
  /* Named in a warning: as much of the name as one needs. */
  if (read === undefined) return { unknown: parsed.type.slice(0, 64) };
  const frame = read(parsed);
  return frame === undefined ? { invalid: `a ${parsed.type} frame` } : { frame };
}

/*
 * The server's answer to `auth`. Its heartbeat is what the connection takes
 * the socket for dead by, so both waits are whole milliseconds a timer can
 * wait out together: a longer one would run out at once, every time.
 */
function readAuthOk(f: Record<string, unknown>): ServerFrame | undefined {
  const { heartbeat, limits } = f;
  if (!isString(f.id) || !isCount(f.v) || !isString(f.connectionId)) return undefined;
  if (!isRecord(heartbeat) || !isRecord(limits) || !isCount(limits.maxMessageSize))
    return undefined;
  const { intervalMs, timeoutMs } = heartbeat;
  if (!isCount(intervalMs) || !isCount(timeoutMs) || intervalMs + timeoutMs > MAX_TIMER_MS) {
    return undefined;
  }
  return {
    type: "auth_ok",
    id: f.id,
    v: f.v,
    connectionId: f.connectionId,
    heartbeat: { intervalMs, timeoutMs },
    limits: { maxMessageSize: limits.maxMessageSize },
  };
}
