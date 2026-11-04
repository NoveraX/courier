import { isRecord } from "../../utils/is-record";

/** What a server says went wrong, as a frame carries it. */
export interface FrameError {
  readonly code: number;
  readonly message: string;
  readonly issues?: readonly unknown[] | undefined;
}

/** A frame a server sends a client, its fields checked. */
export type ServerFrame =
  | { readonly type: "ping" }
  | { readonly type: "pong" }
  /** The credentials sent again were taken (a server before 0.5) */
  | { readonly type: "auth"; readonly id?: string | undefined }
  /** Send the credentials again (a server before 0.5) */
  | { readonly type: "auth_required" }
  | { readonly type: "renamed"; readonly topic: string; readonly to: string }
  | { readonly type: "subscribed"; readonly topic: string; readonly id?: string | undefined }
  | { readonly type: "unsubscribed"; readonly topic: string }
  | { readonly type: "complete"; readonly topic: string; readonly error?: FrameError | undefined }
  | { readonly type: "data"; readonly topic?: string | undefined; readonly payload: unknown }
  | {
      readonly type: "error";
      readonly id?: string | undefined;
      readonly topic?: string | undefined;
      readonly error: FrameError;
    };

/** What reading one message gave: a frame, or why there is none. */
export type FrameReading =
  | { readonly frame: ServerFrame }
  /** A kind of frame this client does not know — a newer server's — ignored */
  | { readonly unknown: string }
  /** A message that is not a frame, or a frame with a field that does not hold */
  | { readonly invalid: string };

type Reader = (fields: Record<string, unknown>) => ServerFrame | undefined;

const READERS: Readonly<Record<string, Reader>> = {
  ping: () => ({ type: "ping" }),
  pong: () => ({ type: "pong" }),
  auth: (f) => optional(f.id, isString, (id) => ({ type: "auth", id })),
  auth_required: () => ({ type: "auth_required" }),
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
  if (read === undefined) return { unknown: parsed.type };
  const frame = read(parsed);
  return frame === undefined ? { invalid: `a ${parsed.type} frame` } : { frame };
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

function isFrameError(value: unknown): value is FrameError {
  return (
    isRecord(value) &&
    typeof value.code === "number" &&
    Number.isInteger(value.code) &&
    typeof value.message === "string" &&
    (value.issues === undefined || Array.isArray(value.issues))
  );
}
