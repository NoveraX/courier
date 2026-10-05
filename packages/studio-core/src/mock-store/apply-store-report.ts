import type { MockCollectionEdits, MockCollectionSnapshot, MockStoreReport } from "../events/mock";

/* The records once the edits are made; `undefined` when they name a record
   the collection does not hold. */
function edited(
  records: readonly unknown[],
  { removed, changed, added }: MockCollectionEdits,
): unknown[] | undefined {
  if (removed.some((index) => index >= records.length)) return undefined;
  const gone = new Set(removed);
  const kept = records.filter((_, index) => !gone.has(index));
  for (const { index, record } of changed) {
    if (index >= kept.length) return undefined;
    kept[index] = record;
  }
  for (const record of added) kept.push(record);
  return kept;
}

/**
 * A mock's collections with a report of its store applied: the collections
 * it holds whole replace those, its edits are made to the ones held, and the
 * collections it names gone are left out. The collections keep their order,
 * and a new one follows them.
 *
 * Edits apply only to the collections as the report before left them: when
 * one names a record or a collection they do not hold, or leaves a
 * collection with another count than the mock's, the result is `undefined`,
 * and whoever holds the collections asks the mock for its store whole.
 *
 * @param collections - The collections as the reports before left them
 * @param report - The report that follows them
 * @returns The collections as the mock holds them now, or `undefined` when the report does not follow them
 * @example
 * ```ts
 * const users = { name: "users", count: 1, records: [{ id: 1 }] };
 * applyStoreReport([users], {
 *   seq: 1,
 *   whole: false,
 *   collections: [{ name: "users", count: 2, edits: { removed: [], changed: [], added: [{ id: 2 }] } }],
 *   removed: [],
 * });
 * // → [{ name: "users", count: 2, records: [{ id: 1 }, { id: 2 }] }]
 * ```
 */
export function applyStoreReport(
  collections: readonly MockCollectionSnapshot[],
  report: MockStoreReport,
): MockCollectionSnapshot[] | undefined {
  const held = new Map(collections.map((collection) => [collection.name, collection]));
  const next = report.whole ? new Map<string, MockCollectionSnapshot>() : new Map(held);
  for (const name of report.removed) next.delete(name);
  for (const entry of report.collections) {
    if ("records" in entry) {
      next.set(entry.name, entry);
      continue;
    }
    const before = held.get(entry.name);
    const records = before && edited(before.records, entry.edits);
    if (records?.length !== entry.count) return undefined;
    next.set(entry.name, { name: entry.name, count: entry.count, records });
  }
  return [...next.values()];
}
