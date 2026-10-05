import { useVirtualizer } from "@tanstack/react-virtual";
import { Server } from "lucide-react";

import type { EndpointRow as Row } from "@/features/explorer/endpoints-table";
import { EndpointRow } from "./endpoint-row";

/* A row's height before it is measured: a source's heading, an endpoint's line. */
const SOURCE_HEIGHT = 32;
const ENDPOINT_HEIGHT = 44;

interface EndpointListProps {
  rows: readonly Row[];
  /** The scrolling section the list sits in. */
  scroller: React.RefObject<HTMLElement | null>;
  columns: string;
  wide: boolean;
  /** The endpoint open in its panel, if any. */
  selected: string | undefined;
  now: number;
  slowMs: number;
  onOpen: (key: string) => void;
}

function keyOf(row: Row | undefined, index: number): string {
  if (!row) return String(index);
  return row.kind === "source" ? `source:${row.source.name}` : row.endpoint.key;
}

/**
 * The Endpoints list's rows — each source's heading, then its endpoints —
 * of which only those in view, and a few either side, are drawn. A row
 * whose middleware wraps is measured as drawn, so rows of any height sit
 * in place.
 *
 * @param props - The rows, the section they scroll in, the columns, the open endpoint, the time, the slow threshold, and what opens one
 * @returns The rows
 * @example
 * ```tsx
 * <EndpointList rows={rows} scroller={listRef} columns={columns} wide selected={key} now={now} slowMs={500} onOpen={open} />
 * ```
 */
export function EndpointList(props: EndpointListProps): React.ReactNode {
  const { rows, scroller, columns, wide, selected, now, slowMs, onOpen } = props;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (rows[index]?.kind === "source" ? SOURCE_HEIGHT : ENDPOINT_HEIGHT),
    getItemKey: (index) => keyOf(rows[index], index),
    overscan: 10,
    /* Rows to draw before the list is first measured: a window's worth. */
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  });
  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtual) => {
        const row = rows[virtual.index];
        if (!row) return null;
        return (
          <div
            key={virtual.key}
            data-index={virtual.index}
            ref={virtualizer.measureElement}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${virtual.start}px)` }}
          >
            {row.kind === "source" ? (
              <div className="flex h-8 items-center gap-2 border-b border-line bg-bg-subtle px-5 font-mono text-small font-semibold">
                <Server aria-hidden="true" className="size-3 text-syntax-type" />
                {row.source.name}
                <span className="font-sans text-label font-normal text-fg-subtle">
                  {row.source.baseURL}
                </span>
              </div>
            ) : (
              <EndpointRow
                endpoint={row.endpoint}
                columns={columns}
                wide={wide}
                selected={selected === row.endpoint.key}
                now={now}
                slowMs={slowMs}
                onOpen={onOpen}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
