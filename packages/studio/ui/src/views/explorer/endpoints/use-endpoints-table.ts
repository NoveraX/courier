import type { SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import type { EndpointNodeData } from "../types";
import { useExplorerData } from "../use-explorer-data";
import type { EndpointFilters } from "./endpoints-filters";
import { applyFilters, EMPTY_FILTERS } from "./endpoints-filters";

// ── Return type ────────────────────────────────────────────────────────────

export interface EndpointsTableState {
  /** All endpoints (unfiltered) for building filter options */
  allEndpoints: EndpointNodeData[];
  /** Filtered endpoints ready for the table */
  rows: EndpointNodeData[];
  /** Total endpoint count */
  total: number;
  /** Whether source data is empty */
  isEmpty: boolean;
  /** Current filter values */
  filters: EndpointFilters;
  /** Update a single filter */
  setFilter: <K extends keyof EndpointFilters>(key: K, value: EndpointFilters[K]) => void;
  /** Reset all filters */
  resetFilters: () => void;
  /** @tanstack/react-table sorting state */
  sorting: SortingState;
  /** Update sorting state */
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

const DEFAULT_SORTING: SortingState = [{ id: "calls", desc: true }];

export function useEndpointsTable(): EndpointsTableState {
  const { endpoints, isEmpty } = useExplorerData();
  const [filters, setFilters] = useState<EndpointFilters>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const rows = useMemo(() => applyFilters(endpoints, filters), [endpoints, filters]);

  const setFilter = <K extends keyof EndpointFilters>(key: K, value: EndpointFilters[K]): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = (): void => setFilters(EMPTY_FILTERS);

  return {
    allEndpoints: endpoints,
    rows,
    total: endpoints.length,
    isEmpty,
    filters,
    setFilter,
    resetFilters,
    sorting,
    setSorting,
  };
}
