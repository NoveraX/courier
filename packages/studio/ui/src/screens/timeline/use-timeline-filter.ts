import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type { TimelineFilter } from "@/features/requests/timeline-filter";
import { OPEN_FILTER } from "@/features/requests/timeline-filter";
import { filterFromSearch, searchFromFilter } from "@/features/requests/timeline-search";

/** What the Timeline shows, and what changes it. */
export interface TimelineFilterControl {
  filter: TimelineFilter;
  setFilter: (next: TimelineFilter) => void;
  reset: () => void;
}

/**
 * What the Timeline shows, kept in its address — so a link, the back
 * button and a reload all show the same — beside the inspector's request.
 *
 * @returns The filter, and what sets and resets it
 * @example
 * ```ts
 * const { filter, setFilter } = useTimelineFilter();
 * setFilter({ ...filter, view: "errors" });
 * ```
 */
export function useTimelineFilter(): TimelineFilterControl {
  const search = useSearch({ from: "/timeline" });
  const navigate = useNavigate({ from: "/timeline" });
  const filter = useMemo(() => filterFromSearch(search), [search]);
  const setFilter = useCallback(
    (next: TimelineFilter) =>
      void navigate({
        search: (prev) => ({ req: prev.req, tab: prev.tab, ...searchFromFilter(next) }),
        replace: true,
      }),
    [navigate],
  );
  const reset = useCallback(() => setFilter(OPEN_FILTER), [setFilter]);
  return { filter, setFilter, reset };
}
