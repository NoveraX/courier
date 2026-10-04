import type { StoredRow } from "./store-database";

/** What the store file holds of one collection, as the store last read or saved it. */
export interface CollectionMirror {
  /** The file's records, by row, in their order. */
  rows: Map<number, { position: number; data: string }>;
  /** The row each of the store's records is kept as; a record not in it is new. */
  keys: WeakMap<object, number>;
  /** The row the next new record takes. */
  nextRow: number;
}

/**
 * Mirror what the store file holds: each collection's rows, in order, with
 * no record of the store bound to them yet.
 *
 * @param held - What the file holds, as `StoreDatabase.read` gives it
 * @returns A mirror per collection
 * @example
 * ```ts
 * const mirrors = storeMirrors(database.read());
 * ```
 */
export function storeMirrors(
  held: ReadonlyMap<string, readonly StoredRow[]>,
): Map<string, CollectionMirror> {
  const mirrors = new Map<string, CollectionMirror>();
  for (const [name, rows] of held) {
    mirrors.set(name, {
      rows: new Map(rows.map(({ row, position, data }) => [row, { position, data }])),
      keys: new WeakMap(),
      nextRow: rows.reduce((top, { row }) => Math.max(top, row), 0) + 1,
    });
  }
  return mirrors;
}
