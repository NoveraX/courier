import { isPlainObject } from "@/socket/is-plain-object";
import { readList } from "./read-list";

/**
 * A socket event's record of string lists — the headers each middleware
 * added — or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @returns The record, or `undefined`
 * @example
 * ```ts
 * readStringListRecord({ auth: ["authorization"] }); // → { auth: ["authorization"] }
 * ```
 */
export function readStringListRecord(value: unknown): Record<string, string[]> | undefined {
  if (!isPlainObject(value)) return undefined;
  const kept: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value)) {
    const strings = readList(list, (item): item is string => typeof item === "string");
    if (strings === undefined) return undefined;
    kept[key] = strings;
  }
  return kept;
}
