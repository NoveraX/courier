import type { FlatItem, GroupedRows, WaterfallRow } from "./types";

/** Build a flat list of items for the virtualizer from groups/rows */
export function buildFlatItems(
  groups: GroupedRows[],
  rows: WaterfallRow[],
  showGroups: boolean,
  collapsedGroups: Set<string>,
): FlatItem[] {
  if (!showGroups) {
    return rows.map((row, i) => ({ type: "row" as const, row, rowIndex: i }));
  }

  const items: FlatItem[] = [];
  let ri = 0;

  for (const group of groups) {
    const isCollapsed = collapsedGroups.has(group.key);
    items.push({ type: "group-header" as const, group, rowIndex: -1, isCollapsed });
    if (!isCollapsed) {
      for (const row of group.rows) {
        items.push({ type: "row" as const, row, rowIndex: ri++ });
      }
    }
  }

  return items;
}
