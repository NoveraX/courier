import { useCallback, useState } from "react";
import { computeAllToggle, computeGroupToggle, toggleInSet } from "./manage-toggle";
import type { EndpointInventory } from "./types";

/** The endpoints the user picked to add and to remove, and the toggles that pick them. */
export interface ManageSelection {
  toAdd: Record<string, Set<string>>;
  toRemove: Record<string, Set<string>>;
  hasChanges: boolean;
  /** Toggle an endpoint: added when inactive, removed when active. */
  toggleEndpoint: (group: string, name: string, currentlyActive: boolean) => void;
  /** Toggle every endpoint of a group. */
  toggleGroup: (groupName: string) => void;
  /** Select all, or deselect all. */
  toggleAll: () => void;
  /** Pick nothing. */
  reset: () => void;
}

/**
 * The manage dialog's endpoint selection over an inventory.
 *
 * @param inventory - The import's endpoints, once loaded
 * @returns The selection and its toggles
 * @example
 * ```ts
 * const selection = useManageSelection(inventory);
 * selection.toggleEndpoint("pets", "listPets", true);
 * ```
 */
export function useManageSelection(inventory: EndpointInventory | null): ManageSelection {
  const [toAdd, setToAdd] = useState<Record<string, Set<string>>>({});
  const [toRemove, setToRemove] = useState<Record<string, Set<string>>>({});

  const hasChanges =
    Object.values(toAdd).some((s) => s.size > 0) || Object.values(toRemove).some((s) => s.size > 0);

  const toggleEndpoint = useCallback((group: string, name: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      setToRemove((prev) => toggleInSet(prev, group, name));
    } else {
      setToAdd((prev) => toggleInSet(prev, group, name));
    }
  }, []);

  const toggleGroup = useCallback(
    (groupName: string) => {
      if (!inventory) return;
      const group = inventory.groups.find((g) => g.name === groupName);
      if (!group) return;
      const result = computeGroupToggle(group, toAdd, toRemove);
      setToAdd(result.toAdd);
      setToRemove(result.toRemove);
    },
    [inventory, toAdd, toRemove],
  );

  const toggleAll = useCallback(() => {
    if (!inventory) return;
    const result = computeAllToggle(inventory, toAdd, toRemove);
    setToAdd(result.toAdd);
    setToRemove(result.toRemove);
  }, [inventory, toAdd, toRemove]);

  const reset = useCallback(() => {
    setToAdd({});
    setToRemove({});
  }, []);

  return { toAdd, toRemove, hasChanges, toggleEndpoint, toggleGroup, toggleAll, reset };
}
