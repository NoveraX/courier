import { num, optNum } from "./event-helpers";
import type { MockEvent } from "./mock-event-types";
import type { MockServerInfo } from "./mock-slice-types";
import { readMockCollections } from "./payload";

/** What a mock's state sets of the page's copy of its store. */
export type StorePatch = Pick<MockServerInfo, "collections" | "recordsLoaded" | "storeSeq">;

/**
 * The store a mock's state brings: its collections with their counts — the
 * records only when they came. Records the page asked for are kept while
 * the state is of the same store, the mock not started again and no report
 * missed; otherwise the counts stand alone until the page asks again. A
 * state without collections leaves the store as the page holds it.
 *
 * @param existing - The mock as the page holds it, when it does
 * @param event - The mock's state, as `mock:server:connect`
 * @returns The collections, whether their records are held, and the number of the last report applied
 * @example
 * ```ts
 * store.addServer({ ...fields, ...storePatchOf(undefined, event) });
 * ```
 */
export function storePatchOf(existing: MockServerInfo | undefined, event: MockEvent): StorePatch {
  const incoming = readMockCollections(event.collections);
  if (!incoming) {
    return existing
      ? {
          collections: existing.collections,
          recordsLoaded: existing.recordsLoaded,
          storeSeq: existing.storeSeq,
        }
      : { collections: [], recordsLoaded: true, storeSeq: 0 };
  }
  const storeSeq = num(event.storeSeq);
  const same =
    existing !== undefined &&
    existing.recordsLoaded !== false &&
    existing.startedAt === (optNum(event.startedAt) ?? existing.startedAt) &&
    existing.storeSeq === storeSeq;
  if (incoming.withRecords || !same) {
    return { collections: incoming.collections, recordsLoaded: incoming.withRecords, storeSeq };
  }
  return { collections: existing.collections, recordsLoaded: true, storeSeq };
}
