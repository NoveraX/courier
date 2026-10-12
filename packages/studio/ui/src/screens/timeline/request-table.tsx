import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { listTierOf, MEDIA } from "@/design/breakpoints";
import { useSessionEnd } from "@/features/sessions/use-session-end";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useElementWidth } from "@/hooks/use-element-width";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-tick";
import { useInspector } from "@/inspector/use-inspector";
import { RowMenu } from "@/request-list/row-menu";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { RequestRow } from "./request-row";
import { StackedRequestRow } from "./request-row-stacked";
import { GROUP_HEIGHT, rowHeightOf, WIDE_FROM } from "./table-columns";
import { GroupHead, HeldPill, TableHead } from "./table-parts";
import { useRowKeys } from "./use-row-keys";

type Item =
  | { kind: "group"; label: "Pinned" | "Live"; count: number }
  | { kind: "row"; request: RequestEntry };

/* The list's width until it is measured: the window's, which a phone's list
   fills, so its rows are stacked from the first frame rather than after it. */
function firstWidth(): number {
  return typeof window === "undefined" ? 1200 : window.innerWidth;
}

/**
 * The requests the Timeline shows, newest first — the pinned ones in a
 * group of their own above the live ones — under the columns' heads; a
 * row opens its request in the inspector, a second click closes it. A list
 * too narrow for its columns has no heads, and puts each row on two lines.
 *
 * @param props - The requests shown
 * @returns The table
 * @example
 * ```tsx
 * <RequestTable requests={shown} />
 * ```
 */
export function RequestTable({ requests }: { requests: readonly RequestEntry[] }): React.ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const now = useNow();
  const endedAt = useSessionEnd();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const timestamps = useStudioStore((s) => s.settings.timestampFormat);
  const { requestId, open, close } = useInspector();
  const tier = listTierOf(useElementWidth(scrollRef, firstWidth()), WIDE_FROM);
  const coarse = useMediaQuery(MEDIA.coarse);
  const rowHeight = rowHeightOf(tier, coarse);
  const { items, ids } = useMemo(() => itemsOf(requests), [requests]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === "group" ? GROUP_HEIGHT : rowHeight),
    getItemKey: (i) => {
      const item = items[i];
      return item?.kind === "row" ? item.request.id : `group:${item?.label ?? i}`;
    },
    overscan: 12,
    /* Rows to draw before the list is first measured: a window's worth. */
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the virtualizer keeps the sizes it worked out; a row of another height asks it again
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);
  useAutoScroll(scrollRef, requests.length, following);
  const select = useCallback(
    (id: string) => (id === requestId ? close() : open(id)),
    [requestId, open, close],
  );
  const move = useCallback(
    (id: string) => {
      open(id);
      const index = items.findIndex((item) => item.kind === "row" && item.request.id === id);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    },
    [items, open, virtualizer],
  );
  useRowKeys(ids, requestId, move);
  const context = { now, endedAt, slowMs, timestamps, wide: tier === "wide" };
  const Row = tier === "stacked" ? StackedRequestRow : RequestRow;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {tier !== "stacked" && <TableHead wide={tier === "wide"} />}
      <HeldPill />
      <RowMenu>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              return (
                <div
                  key={virtual.key}
                  className="absolute inset-x-0"
                  style={{ top: virtual.start, height: virtual.size }}
                >
                  {item.kind === "group" ? (
                    <GroupHead label={item.label} count={item.count} />
                  ) : (
                    <Row
                      request={item.request}
                      selected={item.request.id === requestId}
                      context={context}
                      onSelect={select}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </RowMenu>
    </div>
  );
}

/* The rows in order — the pinned group's head and rows first when any is pinned — and the requests' ids top to bottom. */
function itemsOf(requests: readonly RequestEntry[]): { items: Item[]; ids: string[] } {
  const pinned = requests.filter((r) => r.pinned);
  const live = requests.filter((r) => !r.pinned);
  const rows = (list: RequestEntry[]): Item[] => list.map((request) => ({ kind: "row", request }));
  const items: Item[] =
    pinned.length > 0
      ? [
          { kind: "group", label: "Pinned", count: pinned.length },
          ...rows(pinned),
          { kind: "group", label: "Live", count: live.length },
          ...rows(live),
        ]
      : rows(live);
  return { items, ids: [...pinned, ...live].map((r) => r.id) };
}
