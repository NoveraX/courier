import { isPlainObject } from "@/socket/is-plain-object";
import type { MockCollectionEntry } from "../mock-slice-types";

/** A mock's collections as an event carried them, and whether their records came too. */
export interface ReadMockCollections {
  collections: MockCollectionEntry[];
  /** Whether each collection came with its records; the counts alone, when not */
  withRecords: boolean;
}

/**
 * A mock's collections, from an event: each one's name and count, and its
 * records when they came. A mock's state reaches every page with the counts
 * alone, and a page that shows a mock's records asks for them, so a list
 * of collections without records is the usual one; one with records is a
 * page's answer, or a report of the store whole.
 *
 * @param value - The collections as the socket parsed them
 * @returns The collections, records left empty when none came; `undefined` when the value is not such a list
 * @example
 * ```ts
 * readMockCollections([{ name: "users", count: 2 }]); // { collections: [{ name: "users", count: 2, records: [] }], withRecords: false }
 * ```
 */
export function readMockCollections(value: unknown): ReadMockCollections | undefined {
  if (!Array.isArray(value)) return undefined;
  const collections: MockCollectionEntry[] = [];
  let withRecords = value.length > 0;
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.name !== "string" || typeof item.count !== "number")
      return undefined;
    const records: unknown = item.records;
    if (records !== undefined && !Array.isArray(records)) return undefined;
    if (records === undefined) withRecords = false;
    collections.push({ name: item.name, count: item.count, records: records ?? [] });
  }
  return { collections, withRecords: withRecords || value.length === 0 };
}
