import { useMemo, useCallback } from "react";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { useRequestDetail } from "@/hooks/use-request-detail";
import { useDevToolsStore } from "@/store";

import { filterRequests } from "./filters";
import { useTimelineSearch } from "./use-timeline-search";
import { Toolbar } from "./toolbar";
import { TimelineFilterBar } from "./filter-bar";
import { RequestList } from "./request-list";

export function TimelineView(): React.ReactElement {
  const requests = useDevToolsStore((s) => s.requests);
  const { selectRequest } = useRequestDetail();
  const {
    filters, showFilters,
    setFilter, resetFilters, toggleFilters,
  } = useTimelineSearch();

  const filtered = useMemo(() => filterRequests(requests, filters), [requests, filters]);
  const pinned = useMemo(() => filtered.filter((r) => r.pinned), [filtered]);
  const unpinned = useMemo(() => filtered.filter((r) => !r.pinned), [filtered]);
  const pinnedCount = useMemo(() => requests.filter((r) => r.pinned).length, [requests]);

  const handleSearchChange = useCallback(
    (value: string) => setFilter("search", value),
    [setFilter],
  );

  const handleSelect = useCallback(
    (id: string | null) => { if (id) selectRequest(id); },
    [selectRequest],
  );

  if (requests.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={Activity}
          heading="Waiting for requests"
          description="Make API calls from your app to see them here in real-time."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Toolbar
        filters={filters}
        showFilters={showFilters}
        onSearchChange={handleSearchChange}
        onToggleFilters={toggleFilters}
        totalCount={requests.length}
        filteredCount={filtered.length}
        pinnedCount={pinnedCount}
      />

      {showFilters && (
        <TimelineFilterBar
          requests={requests}
          filters={filters}
          onFilterChange={setFilter}
          onReset={resetFilters}
        />
      )}

      <RequestList
        requests={unpinned}
        pinnedRequests={pinned}
        selectedId={null}
        onSelect={handleSelect}
      />
    </div>
  );
}
