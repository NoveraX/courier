import { isRecord } from "../../utils/is-record";
import type { FrameError, TopicPosition } from "./server-frame-types";

/*
 * What the fields of a server's frame may hold, each checked as the client
 * reads the frame: a field that does not hold makes the frame no frame.
 */

/**
 * A field a frame may leave out, checked when it is there.
 *
 * @param value - The field
 * @param holds - What it must be when it is there
 * @param make - The frame, from the field as it is, or without it
 * @returns The frame, or nothing when the field does not hold
 * @example
 * ```ts
 * optional(f.id, isString, (id) => ({ type: "unsubscribed", id }));
 * ```
 */
export function optional<TValue, TFrame>(
  value: unknown,
  holds: (value: unknown) => value is TValue,
  make: (value: TValue | undefined) => TFrame,
): TFrame | undefined {
  if (value === undefined) return make(undefined);
  return holds(value) ? make(value) : undefined;
}

/** A string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A whole number from 1: a protocol's version, a size in bytes or milliseconds, an event's number. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** A wait in milliseconds, none included. */
export function isWait(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A close or error code. */
export function isCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** What a server says went wrong: a code, a message, and the issues that made it, if any. */
export function isFrameError(value: unknown): value is FrameError {
  return (
    isRecord(value) &&
    isCode(value.code) &&
    typeof value.message === "string" &&
    (value.issues === undefined || Array.isArray(value.issues))
  );
}

/**
 * A topic's position, as `subscribed` and `resync` carry it: the number of
 * the last event, 0 before the first, and the name of its sequence — up to
 * 64 characters.
 *
 * @param f - The frame's fields
 * @returns The position, or nothing when either field does not hold
 * @example
 * ```ts
 * positionOf({ seq: 41, epoch: "k2m9x" }); // → { seq: 41, epoch: "k2m9x" }
 * ```
 */
export function positionOf(f: Record<string, unknown>): TopicPosition | undefined {
  const { seq, epoch } = f;
  const named = typeof epoch === "string" && epoch.length > 0 && epoch.length <= 64;
  return (seq === 0 || isCount(seq)) && named ? { seq: seq as number, epoch } : undefined;
}
