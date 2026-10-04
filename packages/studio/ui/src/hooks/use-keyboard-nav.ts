import { useCallback } from "react";

/** Arrow key navigation for a list of items with an id field */
export function useKeyboardNav<T extends { id: string }>(
  items: T[],
  selectedId: string | null,
  onSelect: (item: T) => void,
): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      e.preventDefault();
      const idx = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
      const next =
        e.key === "ArrowDown" ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);

      const item = items[next];
      if (item !== undefined) onSelect(item);
    },
    [items, selectedId, onSelect],
  );
}
