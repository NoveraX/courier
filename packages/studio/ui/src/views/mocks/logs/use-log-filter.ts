import { useMemo, useState, useCallback } from "react";

import { matchStatusRange } from "@/lib/filter-utils";

import type { MockRequestLog } from "@/store/mock-slice";

export interface LogFilterState {
  search: string;
  method: string[];
  statusRange: string[];
  group: string[];
}

const INITIAL_STATE: LogFilterState = {
  search: "",
  method: [],
  statusRange: [],
  group: [],
};

export interface LogFilterResult {
  state: LogFilterState;
  filtered: MockRequestLog[];
  showFilters: boolean;
  activeFilterCount: number;
  setSearch: (v: string) => void;
  setFilter: (key: string, values: string[]) => void;
  resetFilters: () => void;
  toggleFilters: () => void;
}

export function useLogFilter(logs: MockRequestLog[]): LogFilterResult {
  const [state, setState] = useState<LogFilterState>(INITIAL_STATE);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => applyFilters(logs, state), [logs, state]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (state.method.length > 0) count++;
    if (state.statusRange.length > 0) count++;
    if (state.group.length > 0) count++;
    return count;
  }, [state]);

  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search })), []);
  const setFilter = useCallback((key: string, values: string[]) => setState((s) => ({ ...s, [key]: values })), []);
  const resetFilters = useCallback(() => setState(INITIAL_STATE), []);
  const toggleFilters = useCallback(() => setShowFilters((v) => !v), []);

  return { state, filtered, showFilters, activeFilterCount, setSearch, setFilter, resetFilters, toggleFilters };
}

function applyFilters(logs: MockRequestLog[], state: LogFilterState): MockRequestLog[] {
  let result = logs;

  if (state.search) {
    const q = state.search.toLowerCase();
    result = result.filter((l) =>
      l.path.toLowerCase().includes(q) || l.endpoint.toLowerCase().includes(q),
    );
  }

  if (state.method.length > 0) {
    result = result.filter((l) => state.method.includes(l.httpMethod));
  }

  if (state.statusRange.length > 0) {
    result = result.filter((l) => {
      if (!l.status) return false;
      return state.statusRange.some((range) => matchStatusRange(l.status!, range));
    });
  }

  if (state.group.length > 0) {
    result = result.filter((l) => state.group.includes(l.group));
  }

  return result;
}

