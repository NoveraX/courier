import type { RequestEntry, WaterfallSortField, WaterfallGroupBy } from "@/store";

import type { WaterfallRow, GroupedRows, ZoomState } from "./types";
import { buildDirectSegments, buildProxySegments } from "./build-segments";
import { TICK_INTERVALS, MIN_TICK_GAP_PX, MS_PER_PX_BASE } from "./constants";

// Re-export compression utilities (split for file-size compliance)
export { compressTimeline, decompressMs } from "./compress";

// ── Layout computation ─────────────────────────────────────────────────────

export function buildRows(requests: RequestEntry[]): WaterfallRow[] {
  if (requests.length === 0) return [];

  const earliest = Math.min(...requests.map((r) => r.startedAt));

  return requests.map((r) => {
    const isProxy = r.mode === "proxy";
    const timing = r.timing ?? { total: 0, middleware: 0, fetch: 0, validation: 0 };

    let segments: WaterfallRow["segments"];
    let totalDuration: number;

    if (isProxy && r.proxyTiming) {
      segments = buildProxySegments(timing, r.proxyTiming);
      totalDuration = r.proxyTiming.clientToProxy + timing.total + r.proxyTiming.proxyToClient;
    } else {
      segments = buildDirectSegments(timing);
      totalDuration = timing.total || 0;
    }

    return { request: r, offsetMs: r.startedAt - earliest, segments, totalDuration, isProxy };
  });
}

// ── Sorting ────────────────────────────────────────────────────────────────

export function sortRows(rows: WaterfallRow[], sortBy: WaterfallSortField): WaterfallRow[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case "startTime": return a.request.startedAt - b.request.startedAt;
      case "duration": return b.totalDuration - a.totalDuration;
      case "size": return (b.request.size ?? 0) - (a.request.size ?? 0);
    }
  });
}

// ── Grouping ───────────────────────────────────────────────────────────────

export function groupRows(rows: WaterfallRow[], groupBy: WaterfallGroupBy): GroupedRows[] {
  if (groupBy === "none") return [{ key: "__all", label: "", rows }];

  const map = new Map<string, WaterfallRow[]>();

  for (const row of rows) {
    const key = groupBy === "source" ? row.request.source : (row.request.group ?? "ungrouped");
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }

  return Array.from(map.entries()).map(([key, grouped]) => ({
    key,
    label: key,
    rows: grouped,
  }));
}

// ── Time ruler ─────────────────────────────────────────────────────────────

export function computeTickInterval(zoom: ZoomState): number {
  const pxPerMs = zoom.scale / MS_PER_PX_BASE;

  for (const interval of TICK_INTERVALS) {
    if (interval * pxPerMs >= MIN_TICK_GAP_PX) return interval;
  }

  return TICK_INTERVALS[TICK_INTERVALS.length - 1]!;
}

// ── Conversion utilities ───────────────────────────────────────────────────

export function msToPixels(ms: number, scale: number): number {
  return (ms * scale) / MS_PER_PX_BASE;
}

export function pixelsToMs(px: number, scale: number): number {
  return (px * MS_PER_PX_BASE) / scale;
}

export function computeTimeSpan(rows: WaterfallRow[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.offsetMs + r.totalDuration));
}

// ── Ruler tick formatter ───────────────────────────────────────────────────

export function formatRulerTick(ms: number): string {
  if (ms < 1) return "0";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}
