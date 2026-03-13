import { useCallback, useMemo } from "react";
import { getRouteApi } from "@tanstack/react-router";

import type { TimelineFilters } from "../../store";

import type { TimelineSearchParams } from "../../routes/timeline";

const routeApi = getRouteApi("/timeline");

/** Maps URL search params → TimelineFilters (store-compatible shape) */
function toFilters(s: TimelineSearchParams): TimelineFilters {
  return {
    search: s.search ?? "",
    status: s.status ?? [],
    mode: s.mode ?? [],
    type: s.type ?? [],
    httpMethod: s.method ?? [],
    source: s.source ?? [],
    group: s.group ?? [],
    minDuration: s.minDuration ?? null,
  };
}

/** Maps TimelineFilters → partial search params for navigate() */
function fromFilters(f: TimelineFilters): Partial<TimelineSearchParams> {
  return {
    search: f.search || undefined,
    status: f.status.length > 0 ? f.status : undefined,
    mode: f.mode.length > 0 ? f.mode : undefined,
    type: f.type.length > 0 ? f.type : undefined,
    method: f.httpMethod.length > 0 ? f.httpMethod : undefined,
    source: f.source.length > 0 ? f.source : undefined,
    group: f.group.length > 0 ? f.group : undefined,
    minDuration: f.minDuration ?? undefined,
  };
}

export function useTimelineSearch() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const filters = useMemo(() => toFilters(search), [search]);
  const selectedRequestId = search.request ?? null;
  const showFilters = search.filters ?? false;

  const setFilters = useCallback(
    (f: TimelineFilters) => {
      void navigate({ search: (prev) => ({ ...prev, ...fromFilters(f) }) });
    },
    [navigate],
  );

  const selectRequest = useCallback(
    (id: string | null) => {
      void navigate({ search: (prev) => ({ ...prev, request: id ?? undefined }) });
    },
    [navigate],
  );

  const setShowFilters = useCallback(
    (v: boolean) => {
      void navigate({ search: (prev) => ({ ...prev, filters: v || undefined }) });
    },
    [navigate],
  );

  return { filters, selectedRequestId, showFilters, setFilters, selectRequest, setShowFilters };
}
