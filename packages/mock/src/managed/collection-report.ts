/** A collection as last reported: its records, each the object the store holds, and each one's JSON. */
export interface ReportedCollection {
  records: readonly object[];
  data: readonly string[];
}

/** The edits that turn a collection as last reported into the collection as it is now. */
export interface CollectionEdits {
  removed: number[];
  changed: Array<{ index: number; record: object }>;
  added: object[];
}

/** A collection that changed: whole, or as the edits to the one last reported. */
export type CollectionReport =
  | { name: string; count: number; records: readonly object[] }
  | { name: string; count: number; edits: CollectionEdits };

/* A record weighs on the wire about as much as this many indexes of records gone. */
const INDEXES_PER_RECORD = 16;

/**
 * Remember a collection's records as they are now, to report later only
 * what changed in them.
 *
 * @param records - The collection's records, in order
 * @returns The collection as reported
 * @example
 * ```ts
 * const reported = remember(store.collection("users").getAll());
 * ```
 */
export function remember(records: readonly object[]): ReportedCollection {
  return { records, data: records.map((record) => JSON.stringify(record)) };
}

/* The edits that turn the records last reported into these; `undefined` when
   none can: records that moved, or one added before records it follows. A
   record is the one reported when it is the same object, which a handler may
   have changed in place, so each is compared by its JSON; the same object
   held a second time is a record added. */
function editsOf(
  before: ReportedCollection,
  after: ReportedCollection,
): CollectionEdits | undefined {
  const at = new Map<object, number>();
  before.records.forEach((record, index) => {
    if (!at.has(record)) at.set(record, index);
  });
  const edits: CollectionEdits = { removed: [], changed: [], added: [] };
  const kept = new Set<number>();
  let last = -1;
  for (const [index, record] of after.records.entries()) {
    const was = at.get(record);
    if (was === undefined || kept.has(was)) {
      edits.added.push(record);
      continue;
    }
    if (was < last || edits.added.length > 0) return undefined;
    last = was;
    kept.add(was);
    if (before.data[was] !== after.data[index]) edits.changed.push({ index, record });
  }
  for (const index of before.records.keys()) if (!kept.has(index)) edits.removed.push(index);
  return edits;
}

/**
 * What changed in a collection since it was last reported: its edits, or
 * the collection whole when it is new to the reports, when its records
 * moved, or when sending it whole weighs no more than its edits. `null`
 * when nothing changed.
 *
 * @param name - The collection's name
 * @param before - The collection as last reported, or `undefined` for one never reported
 * @param after - The collection as it is now
 * @returns The report of the collection, or `null` when it is as reported
 * @example
 * ```ts
 * const now = remember(store.collection("users").getAll());
 * const report = reportCollection("users", reported.get("users"), now);
 * ```
 */
export function reportCollection(
  name: string,
  before: ReportedCollection | undefined,
  after: ReportedCollection,
): CollectionReport | null {
  const count = after.records.length;
  const edits = before === undefined ? undefined : editsOf(before, after);
  if (edits === undefined) return { name, count, records: after.records };
  const { removed, changed, added } = edits;
  if (removed.length + changed.length + added.length === 0) return null;
  const weight = changed.length + added.length + removed.length / INDEXES_PER_RECORD;
  return count <= weight ? { name, count, records: after.records } : { name, count, edits };
}
