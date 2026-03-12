import type { ParsedSpec, ScannedSource } from "./types";
import { groupKey } from "./helpers";

/** Derive initial selection from disk scan — pre-select endpoints that exist on disk */
export function buildSelectionFromScan(
  spec: ParsedSpec,
  scanned: ScannedSource | undefined,
): Record<string, Set<string>> {
  const sel: Record<string, Set<string>> = {};
  if (!scanned) {
    /* No scan data → select all (first import) */
    spec.groups.forEach((g, i) => {
      sel[groupKey(g, i)] = new Set(g.endpoints.map((e) => e.name));
    });
    return sel;
  }
  /* Build set of endpoint names found on disk */
  const onDisk = new Set<string>();
  for (const group of scanned.groups) {
    for (const ep of group.endpoints) onDisk.add(ep.name);
  }
  /* Select only endpoints that exist both in spec and on disk */
  spec.groups.forEach((g, i) => {
    const selected = g.endpoints.filter((e) => onDisk.has(e.name));
    if (selected.length > 0) {
      sel[groupKey(g, i)] = new Set(selected.map((e) => e.name));
    }
  });
  return sel;
}

/**
 * Converts a selection map (group -> Set of endpoint names) into
 * a plain object suitable for API requests, filtering out empty groups.
 */
export function buildSelectedEndpoints(
  selection: Record<string, Set<string>>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [group, endpoints] of Object.entries(selection)) {
    if (endpoints.size > 0) result[group] = [...endpoints];
  }
  return result;
}

/** Build a selection map with all endpoints selected */
export function buildSelectAll(spec: ParsedSpec): Record<string, Set<string>> {
  const sel: Record<string, Set<string>> = {};
  spec.groups.forEach((g, i) => {
    sel[groupKey(g, i)] = new Set(g.endpoints.map((e) => e.name));
  });
  return sel;
}
