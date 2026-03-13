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
  /* Build per-group set of endpoint names found on disk */
  const onDisk = new Map<string, Set<string>>()
  for (const group of scanned.groups) {
    const names = onDisk.get(group.name) ?? new Set<string>()
    for (const ep of group.endpoints) names.add(ep.name)
    onDisk.set(group.name, names)
  }
  /* Select only endpoints that exist both in spec and on disk */
  spec.groups.forEach((g, i) => {
    const diskNames = onDisk.get(g.name)
    if (!diskNames) return
    const selected = g.endpoints.filter((e) => diskNames.has(e.name))
    if (selected.length > 0) {
      sel[groupKey(g, i)] = new Set(selected.map((e) => e.name))
    }
  })
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
