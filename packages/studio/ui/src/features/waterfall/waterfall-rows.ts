import { NO_GROUP_LABEL } from "@/features/requests/filter-options";
import { requestStateOf } from "@/features/requests/request-state";
import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { RequestBar } from "./bar-segments";
import type { WaterfallGroup, WaterfallSort } from "./waterfall-search";

/** A request drawn on the Waterfall, with its bar. */
export interface RequestItem {
  request: RequestEntry;
  bar: RequestBar;
}

/** What a group header stands for, which picks its icon. */
export type GroupKind = "streams" | "http" | "source" | "group";

export interface GroupRow {
  kind: "group";
  key: string;
  label: string;
  groupKind: GroupKind;
  count: number;
  /** How many of its requests went direct and how many through the proxy, when both did. */
  split: { direct: number; proxy: number } | undefined;
  aside: string;
  open: boolean;
}

export type WaterfallRow =
  | GroupRow
  | { kind: "request"; item: RequestItem; indent: boolean }
  | { kind: "stream"; request: RequestEntry };

export interface RowsInput {
  items: readonly RequestItem[];
  streams: readonly RequestEntry[];
  sort: WaterfallSort;
  group: WaterfallGroup;
  closed: ReadonlySet<string>;
}

/**
 * The requests in the order the Waterfall's sort asks for: by start, the
 * longest first, or the largest first.
 *
 * @param items - The requests and their bars
 * @param sort - The sort
 * @returns A new, sorted list
 * @example
 * ```ts
 * sortItems(items, "duration")[0]?.bar.total; // the longest
 * ```
 */
export function sortItems(items: readonly RequestItem[], sort: WaterfallSort): RequestItem[] {
  if (sort === "duration") return [...items].sort((a, b) => b.bar.total - a.bar.total);
  if (sort === "size")
    return [...items].sort((a, b) => (b.request.size ?? 0) - (a.request.size ?? 0));
  return [...items].sort((a, b) => a.request.startedAt - b.request.startedAt);
}

function header(
  key: string,
  label: string,
  groupKind: GroupKind,
  items: readonly RequestItem[],
  closed: ReadonlySet<string>,
): GroupRow {
  const proxy = items.filter((i) => i.request.mode === "proxy").length;
  const avg = items.reduce((sum, i) => sum + i.bar.total, 0) / Math.max(1, items.length);
  return {
    kind: "group",
    key,
    label,
    groupKind,
    count: items.length,
    split: proxy > 0 && proxy < items.length ? { direct: items.length - proxy, proxy } : undefined,
    aside: items.length ? `avg ${formatDuration(avg)}` : "",
    open: !closed.has(key),
  };
}

function streamHeader(streams: readonly RequestEntry[], closed: ReadonlySet<string>): GroupRow {
  const live = streams.filter((r) => requestStateOf(r) === "streaming").length;
  const key = "streams";
  return {
    kind: "group",
    key,
    label: "Streams",
    groupKind: "streams",
    count: streams.length,
    split: undefined,
    aside: `${live} live`,
    open: !closed.has(key),
  };
}

/**
 * The Waterfall's rows: its streams under their own header, then its
 * requests — under one header when streams are shown too, or under one per
 * source or group — each header closing its rows when closed.
 *
 * @param input - The requests, the streams, the sort, the grouping and the closed headers
 * @returns The rows, top to bottom
 * @example
 * ```ts
 * waterfallRows({ items, streams: [], sort: "start", group: "none", closed: new Set() });
 * ```
 */
export function waterfallRows(input: RowsInput): WaterfallRow[] {
  const { streams, group, closed } = input;
  const sorted = sortItems(input.items, input.sort);
  const rows: WaterfallRow[] = [];
  if (streams.length) {
    const head = streamHeader(streams, closed);
    rows.push(head);
    if (head.open) for (const request of streams) rows.push({ kind: "stream", request });
  }
  const section = (key: string, label: string, kind: GroupKind, items: RequestItem[]): void => {
    const head = header(key, label, kind, items, closed);
    rows.push(head);
    if (head.open) for (const item of items) rows.push({ kind: "request", item, indent: true });
  };
  if (group === "none") {
    if (streams.length) section("http", "HTTP requests", "http", sorted);
    else for (const item of sorted) rows.push({ kind: "request", item, indent: false });
    return rows;
  }
  const byKey = new Map<string, RequestItem[]>();
  for (const item of sorted) {
    const key = group === "source" ? item.request.source : (item.request.group ?? "");
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  for (const [key, items] of [...byKey].sort((a, b) => b[1].length - a[1].length)) {
    section(`${group}:${key}`, key || NO_GROUP_LABEL, group, items);
  }
  return rows;
}
