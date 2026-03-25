import { useMemo, useCallback } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import type { RequestEntry, WaterfallSortField, WaterfallGroupBy } from "@/store";

import type { ModeFilter } from "./types";
import { buildRows, sortRows, groupRows, computeTimeSpan, compressTimeline } from "./helpers";
import type { WaterfallSearchParams } from "./search-schema";
import { useZoom } from "./use-zoom";

export function useWaterfall(requests: RequestEntry[]) {
  const params = useSearch({ from: "/waterfall" }) as WaterfallSearchParams;
  const navigate = useNavigate({ from: "/waterfall" });
  const zoomState = useZoom();

  const sortBy: WaterfallSortField = (params.sortBy as WaterfallSortField) ?? "startTime";
  const groupBy: WaterfallGroupBy = (params.groupBy as WaterfallGroupBy) ?? "none";
  const modeFilter: ModeFilter = (params.mode as ModeFilter) ?? "all";
  const search = params.search ?? "";

  // URL sync
  const updateUrl = useCallback(
    (next: Partial<WaterfallSearchParams>) => {
      navigate({
        search: (prev: WaterfallSearchParams) => {
          const merged = { ...prev, ...next };
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(merged)) {
            if (v !== undefined && v !== "" && v !== "none" && v !== "all") clean[k] = v;
          }
          return clean;
        },
        replace: true,
      });
    },
    [navigate],
  );

  // Filter
  const filtered = useMemo(() => {
    let list = requests;
    if (modeFilter !== "all") list = list.filter((r) => r.mode === modeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        `${r.source}.${r.group ?? ""}.${r.method}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [requests, modeFilter, search]);

  // Build → sort → compress → group
  const allRows = useMemo(() => buildRows(filtered), [filtered]);
  const sortedRows = useMemo(() => sortRows(allRows, sortBy), [allRows, sortBy]);
  const { rows, gaps } = useMemo(() => compressTimeline(sortedRows), [sortedRows]);
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const timeSpan = useMemo(() => computeTimeSpan(rows), [rows]);
  const actualTimeSpan = useMemo(() => computeTimeSpan(allRows), [allRows]);

  // URL param actions
  const setSortBy = useCallback((s: WaterfallSortField) => updateUrl({ sortBy: s }), [updateUrl]);
  const setGroupBy = useCallback((g: WaterfallGroupBy) => updateUrl({ groupBy: g }), [updateUrl]);
  const setModeFilter = useCallback((m: ModeFilter) => updateUrl({ mode: m }), [updateUrl]);
  const setSearch = useCallback((s: string) => updateUrl({ search: s || undefined }), [updateUrl]);

  return {
    rows, groups, gaps, timeSpan, actualTimeSpan, sortBy, groupBy, modeFilter, search,
    setSortBy, setGroupBy, setModeFilter, setSearch,
    ...zoomState,
  };
}
