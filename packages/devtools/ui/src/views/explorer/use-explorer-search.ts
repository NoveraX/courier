import { useCallback, useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import type { ExplorerSearchParams, ExplorerLayout, ExplorerMetricMode } from "./types";

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_LAYOUTS = new Set<ExplorerLayout>(["LR", "TB"]);
const VALID_METRICS = new Set<ExplorerMetricMode>(["latency", "errors", "traffic", "size"]);

export function validateExplorerSearch(
  raw: Record<string, unknown>,
): ExplorerSearchParams {
  return {
    layout: parseLayout(raw.layout),
    search: parseString(raw.search),
    selected: parseString(raw.selected),
    metricMode: parseMetricMode(raw.metricMode),
    minimap: parseBoolean(raw.minimap),
  };
}

// ── State & Actions ─────────────────────────────────────────────────────────

interface ExplorerSearchState {
  layout: ExplorerLayout;
  search: string;
  selectedEndpoint: string | null;
  metricMode: ExplorerMetricMode;
  showMinimap: boolean;
}

interface ExplorerSearchActions {
  setLayout: (layout: ExplorerLayout) => void;
  setSearch: (search: string) => void;
  selectEndpoint: (key: string | null) => void;
  setMetricMode: (mode: ExplorerMetricMode) => void;
  toggleMinimap: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/** Search params hook for /explorer/graph (where validateSearch is configured) */
export function useExplorerSearch(): ExplorerSearchState & ExplorerSearchActions {
  const search = useSearch({ from: "/explorer/graph" }) as ExplorerSearchParams;
  const navigate = useNavigate({ from: "/explorer/graph" });

  const state: ExplorerSearchState = useMemo(() => ({
    layout: search.layout ?? "LR",
    search: search.search ?? "",
    selectedEndpoint: search.selected ?? null,
    metricMode: search.metricMode ?? "latency",
    showMinimap: search.minimap ?? true,
  }), [search]);

  const update = useCallback(
    (patch: Partial<ExplorerSearchParams>) => {
      navigate({ search: (prev) => clean({ ...(prev as ExplorerSearchParams), ...patch }), replace: true });
    },
    [navigate],
  );

  const actions: ExplorerSearchActions = useMemo(() => ({
    setLayout: (layout) => update({ layout }),
    setSearch: (s) => update({ search: s || undefined }),
    selectEndpoint: (key) => update({ selected: key ?? undefined }),
    setMetricMode: (mode) => update({ metricMode: mode }),
    toggleMinimap: () => update({ minimap: !state.showMinimap }),
  }), [update, state.showMinimap]);

  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** Remove undefined/default values to keep URL clean */
function clean(params: ExplorerSearchParams): ExplorerSearchParams {
  const out: ExplorerSearchParams = {};
  if (params.layout && params.layout !== "LR") out.layout = params.layout;
  if (params.search) out.search = params.search;
  if (params.selected) out.selected = params.selected;
  if (params.metricMode && params.metricMode !== "latency") out.metricMode = params.metricMode;
  if (params.minimap === false) out.minimap = false;
  return out;
}

function parseString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseLayout(v: unknown): ExplorerLayout | undefined {
  return typeof v === "string" && VALID_LAYOUTS.has(v as ExplorerLayout)
    ? (v as ExplorerLayout)
    : undefined;
}

function parseMetricMode(v: unknown): ExplorerMetricMode | undefined {
  return typeof v === "string" && VALID_METRICS.has(v as ExplorerMetricMode)
    ? (v as ExplorerMetricMode)
    : undefined;
}

function parseBoolean(v: unknown): boolean | undefined {
  if (v === true || v === "true" || v === "1") return true;
  if (v === false || v === "false" || v === "0") return false;
  return undefined;
}
