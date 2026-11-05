import { isRecord } from "../../utils/is-record";
import type { FrameError, FrameReading, ServerFrame } from "./server-frame-types";

type Reader = (fields: Record<string, unknown>) => ServerFrame | undefined;

/* The longest wait a timer keeps: a longer one runs out at once. */
const MAX_TIMER_MS = 2_147_483_647;

const READERS: Readonly<Record<string, Reader>> = {
  ping: () => ({ type: "ping" }),
  pong: () => ({ type: "pong" }),
  auth_ok: readAuthOk,
  auth_error: (f) => {
    if (!isFrameError(f.error) || !isVersion(f.v)) return undefined;
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
  subscribed: (f) =>
    isString(f.topic)
      ? optional(f.id, isString, (id) => ({ type: "subscribed", topic: f.topic as string, id }))
      : undefined,
  unsubscribed: (f) => (isString(f.topic) ? { type: "unsubscribed", topic: f.topic } : undefined),
  complete: (f) =>
    isString(f.topic)
      ? optional(f.error, isFrameError, (error) => ({
          type: "complete",
          topic: f.topic as string,
          error,
        }))
      : undefined,
  data: (f) =>
    optional(f.topic, isString, (topic) => ({ type: "data", topic, payload: f.payload })),
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
  if (!isString(f.id) || !isVersion(f.v) || !isString(f.connectionId)) return undefined;
  if (!isRecord(heartbeat) || !isRecord(limits) || !isSize(limits.maxMessageSize)) return undefined;
  const { intervalMs, timeoutMs } = heartbeat;
  if (!isSize(intervalMs) || !isSize(timeoutMs) || intervalMs + timeoutMs > MAX_TIMER_MS) {
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

/* A field a frame may leave out, checked when it is there. */
function optional<TValue, TFrame>(
  value: unknown,
  holds: (value: unknown) => value is TValue,
  make: (value: TValue | undefined) => TFrame,
): TFrame | undefined {
  if (value === undefined) return make(undefined);
  return holds(value) ? make(value) : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/* A protocol's version: 1, 2, … */
function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/* A count of bytes or milliseconds no smaller than one. */
function isSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/* A wait in milliseconds, none included. */
function isWait(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFrameError(value: unknown): value is FrameError {
  return (
    isRecord(value) &&
    isCode(value.code) &&
    typeof value.message === "string" &&
    (value.issues === undefined || Array.isArray(value.issues))
  );
}
