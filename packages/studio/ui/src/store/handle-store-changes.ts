import type { MockStoreReport } from "@noverax/courier-studio-core";
import { applyStoreReport, readStoreReport } from "@noverax/courier-studio-core";
import type { MockEvent } from "./mock-event-types";
import { mockServerOf } from "./mock-server-of";
import { useMockStore } from "./mock-slice";
import type { MockCollectionEntry } from "./mock-slice-types";

/**
 * Apply a report of a mock's store to the page's copy of it. A report
 * applies to the store as the one before it left it, and one older than the
 * page's copy is passed over. A page that holds the counts alone — it has
 * not shown the mock's records — takes each report's counts; so does one
 * whose records the report does not fit, as when it skips a report, and
 * that page holds the counts alone from then on: a page that shows the
 * records asks Studio for them again, one that does not never needs them.
 *
 * @param serverId - The mock that reported
 * @param event - The `mock:store:changes` event
 * @example
 * ```ts
 * handleStoreChanges("shop", event);
 * ```
 */
export function handleStoreChanges(serverId: string, event: MockEvent): void {
  const store = useMockStore.getState();
  const server = mockServerOf(store.servers, serverId);
  const report = readStoreReport(event);
  if (server === undefined || report === undefined) return;
  if (!report.whole && report.seq <= server.storeSeq) return;
  const follows = report.whole || report.seq === server.storeSeq + 1;
  const collections =
    server.recordsLoaded !== false && follows
      ? applyStoreReport(server.collections, report)
      : undefined;
  if (collections) store.setServerCollections(serverId, collections, report.seq, true);
  else
    store.setServerCollections(
      serverId,
      countsAfter(server.collections, report),
      report.seq,
      false,
    );
}

/* The collections' counts as a report leaves them: a collection gone, a new one, each count. */
function countsAfter(
  collections: readonly MockCollectionEntry[],
  report: MockStoreReport,
): MockCollectionEntry[] {
  const counts = new Map(report.collections.map((each) => [each.name, each.count]));
  const removed = new Set(report.removed);
  const kept = collections
    .filter((each) => !removed.has(each.name) && (!report.whole || counts.has(each.name)))
    .map((each) => ({ name: each.name, count: counts.get(each.name) ?? each.count, records: [] }));
  const known = new Set(kept.map((each) => each.name));
  for (const { name, count } of report.collections) {
    if (!known.has(name)) kept.push({ name, count, records: [] });
  }
  return kept;
}
