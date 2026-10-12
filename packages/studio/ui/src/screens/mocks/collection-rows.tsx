import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { MEDIA } from "@/design/breakpoints";
import type { CollectionColumn } from "@/features/mocks/collection-view";
import { recordKey } from "@/features/mocks/data-table-utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useStoreCrud } from "@/mocks/use-store-crud";
import { EditableCell } from "./editable-cell";

/* Every row is one line high, so the list knows where each one sits without measuring it;
   a finger needs a taller one than a mouse. */
const ROW_HEIGHT = 38;
const TOUCH_ROW_HEIGHT = 44;

/* The first field names the record, so it stays in view as the table scrolls sideways, over
   the cells that pass under it. */
const KEY_CELL = "sticky left-0 z-1 flex h-full min-w-0 items-center bg-bg max-[700px]:border-r";

interface CollectionRowsProps {
  serverId: string;
  collection: string;
  rows: readonly Record<string, unknown>[];
  columns: readonly CollectionColumn[];
}

/**
 * A collection's records under a header of its fields, scrolling in both
 * directions under the header that stays in place, with the first field —
 * the one that names a record — and each record's Delete kept in view as it
 * scrolls sideways. Delete shows on a row the mouse is over, and always to a
 * finger, which has no hover to find it by. Only the rows in view, and a
 * few either side, are drawn, so a collection of tens of thousands of
 * records scrolls as one of ten does.
 *
 * @param props - The server, the collection's name, its records and its columns
 * @returns The rows
 * @example
 * ```tsx
 * <CollectionRows serverId="shop" collection="users" rows={rows} columns={columns} />
 * ```
 */
export function CollectionRows({
  serverId,
  collection,
  rows,
  columns,
}: CollectionRowsProps): React.ReactNode {
  const crud = useStoreCrud();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = useMediaQuery(MEDIA.coarse) ? TOUCH_ROW_HEIGHT : ROW_HEIGHT;
  const template = `repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr)) 36px`;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => recordKey(rows[index] ?? {}, index),
    overscan: 12,
    /* Rows to draw before the list is first measured: a window's worth. */
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the virtualizer keeps the places it worked out; rows of another height ask it again
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-max">
        <div
          className="sticky top-0 z-2 grid h-8.5 items-center border-y border-line bg-panel-subtle px-3.5 text-label"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column, index) => (
            <span
              key={column.field}
              className={cn(
                "flex items-baseline gap-1.5 px-2 font-mono text-fg-subtle",
                index === 0 &&
                  "sticky left-0 z-1 bg-panel-subtle max-[700px]:items-center max-[700px]:self-stretch max-[700px]:border-r",
              )}
            >
              {column.field}
              <span className="font-sans text-meta text-syntax-type">{column.label}</span>
            </span>
          ))}
        </div>
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtual) => {
            const row = rows[virtual.index] ?? {};
            const id = recordKey(row, virtual.index);
            return (
              <div
                key={virtual.key}
                className="group absolute inset-x-0 grid items-center border-b border-line px-3.5"
                style={{ top: virtual.start, height: rowHeight, gridTemplateColumns: template }}
              >
                {columns.map((column, index) => {
                  const cell = (
                    <EditableCell
                      key={column.field}
                      value={row[column.field]}
                      type={column.type}
                      locked={column.field === "id" || column.field === "_id"}
                      enumLike={column.label === "enum"}
                      onSave={(value) =>
                        crud.updateRecord(serverId, collection, id, { [column.field]: value })
                      }
                    />
                  );
                  if (index > 0) return cell;
                  return (
                    <div key={column.field} className={KEY_CELL}>
                      {cell}
                    </div>
                  );
                })}
                <span className="sticky right-0 flex h-full items-center justify-end bg-bg max-[700px]:border-l">
                  <button
                    type="button"
                    aria-label={`Delete record ${id}`}
                    onClick={() => crud.deleteRecords(serverId, collection, [id])}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-err focus-visible:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
                  >
                    <Trash2 aria-hidden="true" className="size-3.25" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
