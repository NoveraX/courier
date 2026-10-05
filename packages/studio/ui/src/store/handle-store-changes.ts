import { applyStoreReport, readStoreReport } from "@noverax/courier-studio-core";

import type { MockEvent } from "./mock-event-types";
import { mockServerOf } from "./mock-server-of";
import { useMockStore } from "./mock-slice";

/**
 * Apply a report of a mock's store to the page's copy of it. A report
 * applies to the store as the one before it left it: one older than the
 * page's copy is passed over, and one that skips a report, or whose edits do
 * not fit, leaves the copy as it was and out of step — the mock is then to
 * send its store whole, as a report every page takes, whatever its number.
 *
 * @param serverId - The mock that reported
 * @param event - The `mock:store:changes` event
 * @returns `false` when the page's copy fell out of step with the mock's store
 * @example
 * ```ts
 * if (!handleStoreChanges("shop", event)) askForStore("shop");
 * ```
 */
export function handleStoreChanges(serverId: string, event: MockEvent): boolean {
  const store = useMockStore.getState();
  const server = mockServerOf(store.servers, serverId);
  const report = readStoreReport(event);
  if (server === undefined || report === undefined) return true;
  if (!report.whole && report.seq !== server.storeSeq + 1) return report.seq <= server.storeSeq;
  const collections = applyStoreReport(server.collections, report);
  if (collections === undefined) return false;
  store.setServerCollections(serverId, collections, report.seq);
  return true;
}
