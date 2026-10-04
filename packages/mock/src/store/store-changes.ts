import type { MockStore } from "./mock-store";
import type { StoreChanges } from "./store-database";
import type { CollectionMirror } from "./store-mirror";

/** A save worked out: what to write, and how to mirror it once it is written. */
export interface PendingSave {
  changes: StoreChanges;
  /** Take the changes as written. */
  settle(): void;
}

interface Placed {
  row: number;
  data: string;
  /** What the file holds for the row; `undefined` for a record new to it. */
  before: { position: number; data: string } | undefined;
}

/* The records in their order, each with its row. A record the file does not
   hold yet, or a second appearance of one already placed, takes a new row. */
function place(records: readonly object[], mirror: CollectionMirror): Placed[] {
  const placed: Placed[] = [];
  const seen = new Set<number>();
  for (const record of records) {
    let row = mirror.keys.get(record);
    if (row === undefined || seen.has(row)) {
      row = mirror.nextRow;
      mirror.nextRow += 1;
      mirror.keys.set(record, row);
    }
    seen.add(row);
    placed.push({ row, data: JSON.stringify(record), before: mirror.rows.get(row) });
  }
  return placed;
}

/* Rows keep their positions while the records keep their order and new ones
   only follow them, so an edit, a deletion or an addition writes only its own
   rows; any other order gives every row its index. */
function positions(placed: readonly Placed[]): number[] {
  let last = -1;
  let adding = false;
  for (const { before } of placed) {
    if (before === undefined) {
      adding = true;
    } else if (adding || before.position <= last) {
      return placed.map((_, index) => index);
    } else {
      last = before.position;
    }
  }
  let next = last + 1;
  return placed.map(({ before }) => before?.position ?? next++);
}

/**
 * Work out what saving the store writes to its file: the collections it
 * gained or lost, and the rows of each record added, changed, moved or gone.
 * A record changed in place, by a handler that edited what it was given,
 * counts as changed.
 *
 * @param store - The store
 * @param mirrors - What the file holds, kept current by `settle`
 * @returns The save, or `null` when the file already holds the store
 * @throws When a record cannot be written as JSON — a BigInt, a cycle
 * @example
 * ```ts
 * const save = storeChanges(store, mirrors);
 * if (save) {
 *   database.write(save.changes);
 *   save.settle();
 * }
 * ```
 */
export function storeChanges(
  store: MockStore,
  mirrors: Map<string, CollectionMirror>,
): PendingSave | null {
  const names = store.list();
  const added: string[] = [];
  const removed = [...mirrors.keys()].filter((name) => !names.includes(name));
  const upserts: Array<{ collection: string; row: number; position: number; data: string }> = [];
  const deletes: Array<{ collection: string; row: number }> = [];
  const after = new Map<string, CollectionMirror>();
  for (const collection of names) {
    const known = mirrors.get(collection);
    if (known === undefined) added.push(collection);
    const mirror: CollectionMirror = known ?? { rows: new Map(), keys: new WeakMap(), nextRow: 1 };
    const placed = place(store.collection(collection).getAll(), mirror);
    const at = positions(placed);
    const rows = new Map<number, { position: number; data: string }>();
    placed.forEach(({ row, data, before }, index) => {
      const position = at[index] ?? index;
      rows.set(row, { position, data });
      if (before === undefined || before.data !== data || before.position !== position) {
        upserts.push({ collection, row, position, data });
      }
    });
    for (const row of mirror.rows.keys()) if (!rows.has(row)) deletes.push({ collection, row });
    after.set(collection, { ...mirror, rows });
  }
  if (added.length + removed.length + upserts.length + deletes.length === 0) return null;
  return {
    changes: { added, removed, upserts, deletes },
    settle() {
      for (const name of removed) mirrors.delete(name);
      for (const [name, mirror] of after) mirrors.set(name, mirror);
    },
  };
}
