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
 */

import type { BindingStatus, BindingTable } from "./catalog/binding-table";
import { getRuntimeEntry } from "./runtime-namespace-state";

export interface BindingSnapshotPayload {
  rows: BindingStatus[];
  runtimeCount: number;
  sourceCount: number;
}

/** Build a fresh `binding:snapshot` payload from the live binding table. */
export function buildBindingSnapshot(bindingTable: BindingTable): BindingSnapshotPayload {
  const rows = enrichWithAppOrigin(bindingTable.getStatus());
  return {
    rows,
    runtimeCount: countDistinctRuntimes(rows),
    sourceCount: countDistinctSources(rows),
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

function countDistinctRuntimes(rows: BindingStatus[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status === "bound" && row.runtimeId) ids.add(row.runtimeId);
  }
  return ids.size;
}

function countDistinctSources(rows: BindingStatus[]): number {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.status === "bound") names.add(row.sourceName);
  }
  return names.size;
}
