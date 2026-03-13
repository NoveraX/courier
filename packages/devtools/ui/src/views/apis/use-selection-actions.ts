import { useCallback } from "react";

import type { ParsedSpec } from "./types";
import { groupKey } from "./helpers";
import { buildSelectAll } from "./selection-helpers";

interface UseSelectionActionsParams {
  spec: ParsedSpec | null;
  setSelection: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  setExpandedGroups?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export interface SelectionActions {
  toggleGroup: (gKey: string) => void;
  toggleEndpoint: (gKey: string, name: string) => void;
  toggleExpand: (key: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
}

export function useSelectionActions({
  spec,
  setSelection,
  setExpandedGroups,
}: UseSelectionActionsParams): SelectionActions {
  const toggleGroup = useCallback((gKey: string) => {
    if (!spec) return;
    const group = spec.groups.find((g, i) => groupKey(g, i) === gKey);
    if (!group) return;
    setSelection((prev) => {
      const current = prev[gKey] ?? new Set();
      const allSelected = current.size === group.endpoints.length;
      return { ...prev, [gKey]: allSelected ? new Set() : new Set(group.endpoints.map((e) => e.name)) };
    });
  }, [spec, setSelection]);

  const toggleEndpoint = useCallback((gKey: string, name: string) => {
    setSelection((prev) => {
      const current = new Set(prev[gKey] ?? []);
      if (current.has(name)) current.delete(name);
      else current.add(name);
      return { ...prev, [gKey]: current };
    });
  }, [setSelection]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedGroups?.((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [setExpandedGroups]);

  const selectAll = useCallback(() => {
    if (!spec) return;
    setSelection(buildSelectAll(spec));
  }, [spec, setSelection]);

  const deselectAll = useCallback(() => setSelection({}), [setSelection]);

  return { toggleGroup, toggleEndpoint, toggleExpand, selectAll, deselectAll };
}
