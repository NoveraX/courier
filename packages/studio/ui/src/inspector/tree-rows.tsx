import { useEffect, useRef, useState } from "react";

import { MEDIA } from "@/design/breakpoints";
import type { JsonTreeRow } from "@/features/requests/json-tree";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRowWindow } from "@/hooks/use-row-window";
import { TreeRow } from "./json-tree-row";

/* A row's height until one is drawn: a finger's rows are taller than a mouse's. */
const ROW_HEIGHT = 25;
const TOUCH_ROW_HEIGHT = 32;

interface TreeRowsProps {
  rows: readonly JsonTreeRow[];
  /** The text a search seeks, marked where it is found; blank marks nothing. */
  query: string;
  /** The path of the search's current match. */
  current: string | undefined;
  onToggle: (path: string) => void;
  /** Whether a search found nothing here: the tree says so. */
  none?: boolean | undefined;
}

function keyOf(row: JsonTreeRow): string {
  return `${row.kind}:${row.path}`;
}

/* The row that holds the focus, by its key, while the focus is in the list. */
function useFocusedRow(listRef: React.RefObject<HTMLElement | null>): string | undefined {
  const [focused, setFocused] = useState<string | undefined>(undefined);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const enter = (event: FocusEvent) => {
      const row = event.target instanceof Element ? event.target.closest("[data-row]") : null;
      setFocused(row?.getAttribute("data-row") ?? undefined);
    };
    const leave = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && list.contains(event.relatedTarget))) {
        setFocused(undefined);
      }
    };
    list.addEventListener("focusin", enter);
    list.addEventListener("focusout", leave);
    return () => {
      list.removeEventListener("focusin", enter);
      list.removeEventListener("focusout", leave);
    };
  }, [listRef]);
  return focused;
}

/**
 * The rows of a JSON tree in their frame, and what it says when a search
 * found nothing in it. A long tree draws the rows its pane shows and a
 * few either side, so an answer of thousands of items scrolls as one of
 * ten does; the search's current match and the row that holds the focus
 * stay drawn wherever the pane is scrolled, so the match can be brought
 * into sight and the focus is kept.
 *
 * @param props - The rows, the search, and what toggles a container
 * @returns The tree
 * @example
 * ```tsx
 * <TreeRows rows={rows} query="kazan" current="cities.3.name" onToggle={toggle} />
 * ```
 */
export function TreeRows({ rows, query, current, onToggle, none }: TreeRowsProps): React.ReactNode {
  const listRef = useRef<HTMLDivElement | null>(null);
  const touch = useMediaQuery(MEDIA.coarse);
  const focused = useFocusedRow(listRef);
  const currentAt =
    current === undefined ? -1 : rows.findIndex((r) => r.kind !== "close" && r.path === current);
  const focusedAt = focused === undefined ? -1 : rows.findIndex((r) => keyOf(r) === focused);
  const { rowHeight, indexes } = useRowWindow({
    listRef,
    count: rows.length,
    estimate: touch ? TOUCH_ROW_HEIGHT : ROW_HEIGHT,
    kept: [currentAt, focusedAt],
  });
  return (
    <div className="overflow-auto rounded-panel border border-line bg-inset py-1.5">
      <div ref={listRef} className="relative" style={{ height: rows.length * rowHeight }}>
        {indexes.map((index) => {
          const row = rows[index];
          if (!row) return null;
          return (
            <div
              key={keyOf(row)}
              data-row={keyOf(row)}
              className="absolute inset-x-0"
              style={{ top: index * rowHeight }}
            >
              <TreeRow
                row={row}
                query={query}
                current={row.kind !== "close" && current === row.path}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </div>
      {none && <p className="m-0 px-3 py-2 text-small text-fg-subtle">Nothing here matches.</p>}
    </div>
  );
}
