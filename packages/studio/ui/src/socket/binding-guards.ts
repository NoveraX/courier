/**
 * Wire-boundary type guards for `binding:snapshot` / `binding:error` payloads
 * arriving from the Studio server over the `/ui` Socket.IO namespace.
 *
 * The Socket.IO client cannot validate event payload shapes — every callback
 * receives `unknown`. These guards are the single trust boundary on the UI
 * side: anything reaching the Zustand store has already been shape-checked,
 * so reducers can rely on the declared types without defensive nesting.
 *
 * If you add a new field to the wire format, update both the matching
 * `interface` in `store/types-ui.ts` AND the corresponding guard here, plus
 * the unit test in `__tests__/binding-guards.test.ts`.
 */

import type { BindingErrorPayload, BindingSnapshot, BindingTransport } from "@/store/types-ui";
import { isPlainObject } from "./is-plain-object";

const VALID_TRANSPORTS: ReadonlyArray<BindingTransport> = ["http", "sse", "ws"];
const VALID_STATUSES = ["bound", "orphan", "conflict"] as const;

export function isBindingSnapshot(data: unknown): data is BindingSnapshot {
  if (!isPlainObject(data)) return false;
  const d = data;
  if (!Array.isArray(d.rows)) return false;
  if (typeof d.runtimeCount !== "number" || !Number.isFinite(d.runtimeCount)) return false;
  if (typeof d.sourceCount !== "number" || !Number.isFinite(d.sourceCount)) return false;
  if (!Array.isArray(d.runtimes) || !d.runtimes.every(isRuntimeKindRow)) return false;
  for (const row of d.rows) {
    if (!isBindingStatusRow(row)) return false;
  }
  return true;
}

function isRuntimeKindRow(row: unknown): boolean {
  return (
    isPlainObject(row) &&
    typeof row.runtimeId === "string" &&
    (row.kind === "browser" || row.kind === "server")
  );
}

function isBindingStatusRow(row: unknown): boolean {
  if (!isPlainObject(row)) return false;
  const r = row;
  if (typeof r.sourceName !== "string" || r.sourceName.length === 0) return false;
  if (typeof r.transport !== "string") return false;
  if (!(VALID_TRANSPORTS as ReadonlyArray<string>).includes(r.transport)) return false;
  if (typeof r.status !== "string") return false;
  if (!(VALID_STATUSES as ReadonlyArray<string>).includes(r.status)) return false;
  if (r.runtimeId !== undefined && typeof r.runtimeId !== "string") return false;
  if (r.appOrigin !== undefined && typeof r.appOrigin !== "string") return false;
  if (r.conflicting !== undefined) {
    if (!Array.isArray(r.conflicting)) return false;
    for (const id of r.conflicting) {
      if (typeof id !== "string") return false;
    }
  }
  return true;
}

export function isBindingErrorPayload(data: unknown): data is BindingErrorPayload {
  if (!isPlainObject(data)) return false;
  const d = data;
  if (d.kind !== "conflict") return false;
  if (!isPlainObject(d.details)) return false;
  const details = d.details;
  if (typeof details.sourceName !== "string" || details.sourceName.length === 0) return false;
  if (typeof details.transport !== "string") return false;
  if (!(VALID_TRANSPORTS as ReadonlyArray<string>).includes(details.transport)) return false;
  if (!Array.isArray(details.runtimeIds)) return false;
  for (const id of details.runtimeIds) {
    if (typeof id !== "string") return false;
  }
  return true;
}
