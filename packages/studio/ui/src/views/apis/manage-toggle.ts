/**
 * Pure toggle helpers for manage endpoint selection.
 */

import type { EndpointInventory, InventoryEndpoint } from "./types";
import { ownValue } from "@/lib/own-value";

type SetMap = Record<string, Set<string>>;

const isToggleable = (e: InventoryEndpoint): boolean =>
  e.status === "active" || e.status === "removed-from-spec";

const isAvailable = (e: InventoryEndpoint): boolean =>
  e.status === "available";

/** Toggle a name in a group's set — add if missing, remove if present */
export function toggleInSet(prev: SetMap, group: string, name: string): SetMap {
  const next = { ...prev };
  const set = new Set(ownValue(next, group) ?? []);
  if (set.has(name)) set.delete(name);
  else set.add(name);
  next[group] = set;
  return next;
}

/** Check if all toggleable endpoints in a group are currently "selected" */
export function isGroupAllSelected(
  group: EndpointInventory["groups"][number],
  toAdd: Set<string>,
  toRemove: Set<string>,
): boolean {
  const active = group.endpoints.filter(isToggleable);
  const available = group.endpoints.filter(isAvailable);
  const allActiveKept = active.every((e) => !toRemove.has(e.name));
  const allAvailableAdded = available.every((e) => toAdd.has(e.name));
  return allActiveKept && allAvailableAdded;
}

/** Compute new toAdd/toRemove after toggling an entire group */
export function computeGroupToggle(
  group: EndpointInventory["groups"][number],
  toAdd: SetMap,
  toRemove: SetMap,
): { toAdd: SetMap; toRemove: SetMap } {
  const groupName = group.name;
  const active = group.endpoints.filter(isToggleable);
  const available = group.endpoints.filter(isAvailable);
  const allSelected = isGroupAllSelected(
    group,
    ownValue(toAdd, groupName) ?? new Set(),
    ownValue(toRemove, groupName) ?? new Set(),
  );

  if (allSelected) {
    return {
      toAdd: clearGroup(toAdd, groupName),
      toRemove: setAll(toRemove, groupName, active.map((e) => e.name)),
    };
  }
  return {
    toAdd: setAll(toAdd, groupName, available.map((e) => e.name)),
    toRemove: clearGroup(toRemove, groupName),
  };
}

/** Compute new toAdd/toRemove after toggling everything */
export function computeAllToggle(
  inventory: EndpointInventory,
  toAdd: SetMap,
  toRemove: SetMap,
): { toAdd: SetMap; toRemove: SetMap } {
  const allSelected = inventory.groups.every((g) =>
    isGroupAllSelected(g, ownValue(toAdd, g.name) ?? new Set(), ownValue(toRemove, g.name) ?? new Set()),
  );

  if (allSelected) {
    const newRemove: SetMap = {};
    for (const group of inventory.groups) {
      const names = group.endpoints.filter(isToggleable).map((e) => e.name);
      if (names.length > 0) newRemove[group.name] = new Set(names);
    }
    return { toAdd: {}, toRemove: newRemove };
  }

  const newAdd: SetMap = {};
  for (const group of inventory.groups) {
    const names = group.endpoints.filter(isAvailable).map((e) => e.name);
    if (names.length > 0) newAdd[group.name] = new Set(names);
  }
  return { toAdd: newAdd, toRemove: {} };
}

// ── Internal ─────────────────────────────────────────────────────────────────

function setAll(prev: SetMap, group: string, names: string[]): SetMap {
  return { ...prev, [group]: new Set(names) };
}

function clearGroup(prev: SetMap, group: string): SetMap {
  const next = { ...prev };
  delete next[group];
  return next;
}
