/**
 * `binding:snapshot` wire-format payload + builder.
 *
 * The UI consumes this on every binding-table mutation (`binding:snapshot`
 * broadcast from `runtime-namespace.ts`) AND once on initial connect from
 * `ui-namespace.ts` so a UI client that joins after a runtime has already
 * announced still gets the current state without waiting for the next
 * `runtime:announce`.
 *
 * `runtimeCount` / `sourceCount` are computed server-side so the status bar
 * never has to aggregate `rows[]` itself — that aggregation would be race-
 * prone against partial snapshots arriving out of order.
 *
 * They count every runtime attached and every source one of them serves, not
 * the binding rows: a row exists only for a source whose `defineApi`
 * declares a `proxyPath`, which no README setup does, and counting rows read
 * "0 runtimes · 0 sources" while a server and a browser were attached.
 */

import type { BindingStatus, BindingTable } from "./catalog/binding-table";
import { getRuntimeEntry, runtimeRegistry } from "./runtime-namespace-state";

export interface BindingSnapshotPayload {
  rows: BindingStatus[];
  runtimeCount: number;
  sourceCount: number;
  /** Each runtime connected, and whether it runs in a browser or on a server. */
  runtimes: Array<{ runtimeId: string; kind: "browser" | "server" }>;
}

/** Build a fresh `binding:snapshot` payload from the live binding table. */
export function buildBindingSnapshot(bindingTable: BindingTable): BindingSnapshotPayload {
  const rows = enrichWithAppOrigin(bindingTable.getStatus());
  return {
    rows,
    runtimeCount: runtimeRegistry.size,
    sourceCount: countServedSources(),
    runtimes: [...runtimeRegistry.values()].map(({ runtimeId, kind }) => ({ runtimeId, kind })),
  };
}

/**
 * Stamp `appOrigin` onto every `bound` row by reading the owning runtime's
 * `listenOrigin` from `runtimeRegistry`. The binding table is decoupled from
 * runtime registry state on purpose, so the merge happens here at the wire
 * boundary instead of inside `BindingTable.getStatus()`.
 */
function enrichWithAppOrigin(rows: BindingStatus[]): BindingStatus[] {
  return rows.map((row) => {
    if (row.status !== "bound" || !row.runtimeId) return row;
    const entry = getRuntimeEntry(row.runtimeId);
    if (!entry?.listenOrigin) return row;
    return { ...row, appOrigin: entry.listenOrigin };
  });
}

/** Distinct sources the attached runtimes said they serve. */
function countServedSources(): number {
  const names = new Set<string>();
  for (const entry of runtimeRegistry.values()) {
    for (const name of entry.sourceNames) names.add(name);
  }
  return names.size;
}
