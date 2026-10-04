import { isPlainObject } from "@/socket/is-plain-object";

/**
 * A socket event's record of strings — headers, say — or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @returns The record, or `undefined` when it is not one or holds another value
 * @example
 * ```ts
 * readStringRecord({ accept: "application/json" }); // → { accept: "application/json" }
 * readStringRecord({ accept: 1 }); // → undefined
 * ```
 */
export function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) {
    return undefined;
  }
  return Object.fromEntries(entries);
}
