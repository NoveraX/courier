import type { MockCollectionEdits, MockCollectionReport, MockStoreReport } from "../events/mock";

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isName(value: unknown): value is string {
  return typeof value === "string";
}

function changeOf(value: unknown): { index: number; record: unknown } | undefined {
  return isFields(value) && isIndex(value.index)
    ? { index: value.index, record: value.record }
    : undefined;
}

function editsOf(value: unknown): MockCollectionEdits | undefined {
  if (!isFields(value)) return undefined;
  const { removed, changed, added } = value;
  if (!Array.isArray(removed) || !removed.every(isIndex)) return undefined;
  if (!Array.isArray(changed) || !Array.isArray(added)) return undefined;
  const changes = changed.map(changeOf);
  if (changes.includes(undefined)) return undefined;
  return { removed, changed: changes.filter((change) => change !== undefined), added };
}

function collectionOf(value: unknown): MockCollectionReport | undefined {
  if (!isFields(value) || !isName(value.name) || !isIndex(value.count)) return undefined;
  const { name, count } = value;
  if (Array.isArray(value.records)) return { name, count, records: value.records };
  const edits = editsOf(value.edits);
  return edits === undefined ? undefined : { name, count, edits };
}

/**
 * Read a report of a mock's store from an event, as it arrives over a wire:
 * every field for its shape, and `undefined` for a report of another one.
 *
 * @param event - The event that carries the report
 * @returns The report, or `undefined` when the event holds none
 * @example
 * ```ts
 * readStoreReport({ seq: 1, whole: false, collections: [], removed: ["drafts"] });
 * // → { seq: 1, whole: false, collections: [], removed: ["drafts"] }
 * ```
 */
export function readStoreReport(event: Fields): MockStoreReport | undefined {
  const { seq, whole, collections, removed } = event;
  if (!isIndex(seq) || typeof whole !== "boolean") return undefined;
  if (!Array.isArray(collections) || !Array.isArray(removed) || !removed.every(isName)) {
    return undefined;
  }
  const entries = collections.map(collectionOf);
  if (entries.includes(undefined)) return undefined;
  return {
    seq,
    whole,
    collections: entries.filter((entry) => entry !== undefined),
    removed,
  };
}
