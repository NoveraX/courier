import { useCallback, useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import type { TimelineFilters } from "@/store/types";
import { EMPTY_FILTERS } from "@/store/constants";

import type { TimelineSearchParams } from "./search-schema";
import { searchToFilters, filtersToSearch } from "./search-schema";

interface TimelineSearchState {
  filters: TimelineFilters;
  showFilters: boolean;
}

interface TimelineSearchActions {
  setFilter: <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => void;
  resetFilters: () => void;
  toggleFilters: () => void;
}

/** Timeline filter state synced with URL search params */
export function useTimelineSearch(): TimelineSearchState & TimelineSearchActions {
  const search = useSearch({ from: "/timeline" }) as TimelineSearchParams;
  const navigate = useNavigate({ from: "/timeline" });

  const filters = useMemo(() => searchToFilters(search), [search]);
  const showFilters = search.filters ?? false;

  const updateUrl = useCallback(
    (params: TimelineSearchParams) => {
      navigate({ search: params, replace: true });
    },
    [navigate],
  );

  const setFilter = useCallback(
    <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => {
      const next = { ...filters, [key]: value };
      updateUrl(filtersToSearch(next, { showFilters }));
    },
    [filters, showFilters, updateUrl],
  );

  const resetFilters = useCallback(() => {
    updateUrl(filtersToSearch(EMPTY_FILTERS, { showFilters }));
  }, [showFilters, updateUrl]);

  const toggleFilters = useCallback(() => {
    updateUrl(filtersToSearch(filters, { showFilters: !showFilters }));
  }, [filters, showFilters, updateUrl]);

  return useMemo(
    () => ({ filters, showFilters, setFilter, resetFilters, toggleFilters }),
    [filters, showFilters, setFilter, resetFilters, toggleFilters],
  );
}
