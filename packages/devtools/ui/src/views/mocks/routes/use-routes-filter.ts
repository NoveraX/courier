import { useMemo, useState } from "react";

import type { MockRouteEntry } from "@/store/mock-slice";

export type RouteSortKey = "fullPath" | "group" | "hits" | "avgLatency" | "source";
export type SortDir = "asc" | "desc";

interface RoutesFilterState {
  search: string;
  method: string[];
  group: string[];
  source: string[];
  sortKey: RouteSortKey;
  sortDir: SortDir;
}

const INITIAL: RoutesFilterState = {
  search: "",
  method: [],
  group: [],
  source: [],
  sortKey: "fullPath",
  sortDir: "asc",
};

export interface RoutesFilter {
  state: RoutesFilterState;
  filtered: MockRouteEntry[];
  total: number;
  setSearch: (v: string) => void;
  setFilter: (key: string, values: string[]) => void;
  resetFilters: () => void;
  handleSort: (key: RouteSortKey) => void;
}

export function useRoutesFilter(routes: MockRouteEntry[]): RoutesFilter {
  const [state, setState] = useState<RoutesFilterState>(INITIAL);

  const filtered = useMemo(() => {
    let result = routes;

    if (state.search) {
      const q = state.search.toLowerCase();
      result = result.filter(
        (r) => r.fullPath.toLowerCase().includes(q) || r.endpoint.toLowerCase().includes(q),
      );
    }

    if (state.method.length > 0) {
      result = result.filter((r) => state.method.includes(r.httpMethod));
    }

    if (state.group.length > 0) {
      result = result.filter((r) => state.group.includes(r.group));
    }

    if (state.source.length > 0) {
      result = result.filter((r) => state.source.includes(r.source));
    }

    return sortRoutes(result, state.sortKey, state.sortDir);
  }, [routes, state]);

  const setSearch = (search: string) => setState((s) => ({ ...s, search }));

  const setFilter = (key: string, values: string[]) =>
    setState((s) => ({ ...s, [key]: values }));

  const resetFilters = () => setState(INITIAL);

  const handleSort = (key: RouteSortKey) => {
    setState((s) => {
      if (s.sortKey === key) return { ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc" };
      return { ...s, sortKey: key, sortDir: "desc" };
    });
  };

  return { state, filtered, total: routes.length, setSearch, setFilter, resetFilters, handleSort };
}

function sortRoutes(routes: MockRouteEntry[], key: RouteSortKey, dir: SortDir): MockRouteEntry[] {
  const sorted = [...routes].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (typeof aVal === "number" && typeof bVal === "number") return aVal - bVal;
    return String(aVal).localeCompare(String(bVal));
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}
