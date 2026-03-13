import { useCallback, useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import type { TimelineFilters } from "@/store/types";
import { EMPTY_FILTERS } from "@/store/constants";

import type { TimelineSearchParams } from "./search-schema";
import { searchToFilters, filtersToSearch } from "./search-schema";

interface TimelineSearchState {
  filters: TimelineFilters;
  selectedId: string | null;
  showFilters: boolean;
  detailTab: string;
}

interface TimelineSearchActions {
  setFilter: <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => void;
  resetFilters: () => void;
  selectRequest: (id: string | null) => void;
  toggleFilters: () => void;
  setDetailTab: (tab: string) => void;
}

/** Timeline state synced with URL search params */
export function useTimelineSearch(): TimelineSearchState & TimelineSearchActions {
  const search = useSearch({ from: "/timeline" }) as TimelineSearchParams;
  const navigate = useNavigate({ from: "/timeline" });

  const filters = useMemo(() => searchToFilters(search), [search]);
  const selectedId = search.selected ?? null;
  const showFilters = search.filters ?? false;
  const detailTab = search.tab ?? "general";

  const updateUrl = useCallback(
    (params: TimelineSearchParams) => {
      navigate({ search: params, replace: true });
    },
    [navigate],
  );

  const setFilter = useCallback(
    <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => {
      const next = { ...filters, [key]: value };
      updateUrl(filtersToSearch(next, { selected: selectedId, tab: detailTab, showFilters }));
    },
    [filters, selectedId, detailTab, showFilters, updateUrl],
  );

  const resetFilters = useCallback(() => {
    updateUrl(filtersToSearch(EMPTY_FILTERS, { selected: selectedId, tab: detailTab, showFilters }));
  }, [selectedId, detailTab, showFilters, updateUrl]);

  const selectRequest = useCallback(
    (id: string | null) => {
      const tab = id ? "general" : detailTab;
      updateUrl(filtersToSearch(filters, { selected: id, tab, showFilters }));
    },
    [filters, detailTab, showFilters, updateUrl],
  );

  const toggleFilters = useCallback(() => {
    updateUrl(filtersToSearch(filters, { selected: selectedId, tab: detailTab, showFilters: !showFilters }));
  }, [filters, selectedId, detailTab, showFilters, updateUrl]);

  const setDetailTab = useCallback(
    (tab: string) => {
      updateUrl(filtersToSearch(filters, { selected: selectedId, tab, showFilters }));
    },
    [filters, selectedId, showFilters, updateUrl],
  );

  return useMemo(
    () => ({
      filters, selectedId, showFilters, detailTab,
      setFilter, resetFilters, selectRequest, toggleFilters, setDetailTab,
    }),
    [filters, selectedId, showFilters, detailTab, setFilter, resetFilters, selectRequest, toggleFilters, setDetailTab],
  );
}
