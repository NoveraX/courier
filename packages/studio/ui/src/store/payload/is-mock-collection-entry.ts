import { isPlainObject } from "@/socket/is-plain-object";
import type { MockCollectionEntry } from "../mock-slice-types";

/**
 * Whether a socket event's item is one of a mock's collections: its name,
 * its count and its records.
 *
 * @param value - The item as the socket parsed it
 * @returns Whether it is one
 * @example
 * ```ts
 * isMockCollectionEntry({ name: "users", count: 2, records: [{}, {}] }); // → true
 * ```
 */
export function isMockCollectionEntry(value: unknown): value is MockCollectionEntry {
  return (
    isPlainObject(value) &&
    typeof value.name === "string" &&
    typeof value.count === "number" &&
    Array.isArray(value.records)
  );
}
