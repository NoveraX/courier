import type { RequestEntry } from "@/store/types-request";
import { buildKey } from "./compute-stats";
import { labelOf } from "./hints-utils";
import type { AuditItem } from "./types";

const DUPLICATE_WINDOW_MS = 2000;

/**
 * Detect duplicate requests: the same endpoint called again with the same
 * variables within a short window.
 *
 * @param requests - The completed requests
 * @returns A warning for each endpoint and variables called more than once in a burst
 * @example
 * ```ts
 * detectDuplicates(completed)[0]?.title; // "Duplicate requests"
 * ```
 */
export function detectDuplicates(requests: RequestEntry[]): AuditItem[] {
  const groups = new Map<string, RequestEntry[]>();

  for (const r of requests) {
    const sig = `${buildKey(r)}:${stableStringify(r.variables)}`;
    const list = groups.get(sig) ?? [];
    list.push(r);
    groups.set(sig, list);
  }

  const items: AuditItem[] = [];

  for (const [sig, reqs] of groups) {
    if (reqs.length < 2) continue;

    const dupes = findTimeClusters(reqs, DUPLICATE_WINDOW_MS);
    if (dupes.length === 0) continue;

    const allIds = dupes.flatMap((c) => c.map((r) => r.id));
    const totalCount = dupes.reduce((s, c) => s + c.length, 0);
    const first = dupes[0]?.[0];
    if (first === undefined) continue;
    items.push({
      id: `warn-duplicate-${sig}`,
      severity: "warning",
      category: "performance",
      title: "Duplicate requests",
      description: `"${labelOf(first)}" was called again with the same variables within ${DUPLICATE_WINDOW_MS / 1000} s — ${totalCount} calls in ${dupes.length} ${dupes.length === 1 ? "burst" : "bursts"}.`,
      suggestion: "Deduplicate with caching, useMemo, or request deduplication middleware.",
      requestIds: allIds,
    });
  }

  return items;
}

function findTimeClusters(reqs: RequestEntry[], windowMs: number): RequestEntry[][] {
  const sorted = [...reqs].sort((a, b) => a.startedAt - b.startedAt);
  const clusters: RequestEntry[][] = [];
  let current: RequestEntry[] = [];

  for (const r of sorted) {
    const first = current[0];
    if (first === undefined || r.startedAt - first.startedAt <= windowMs) {
      current.push(r);
    } else {
      if (current.length >= 2) clusters.push(current);
      current = [r];
    }
  }
  if (current.length >= 2) clusters.push(current);

  return clusters;
}

/* Variables arrive as JSON, so they hold no cycles; their keys are sorted at every depth. */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]: [string, unknown]) => [key, withSortedKeys(inner)]),
  );
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  return JSON.stringify(withSortedKeys(value));
}
