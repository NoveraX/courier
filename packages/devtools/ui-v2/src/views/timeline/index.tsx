import { useMemo, useCallback, useEffect } from "react";
import { Activity } from "lucide-react";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { EmptyState } from "@/components/shared/empty-state";
import { useDevToolsStore } from "@/store";

import { filterRequests } from "./filters";
import { useTimelineSearch } from "./use-timeline-search";
import { Toolbar } from "./toolbar";
import { TimelineFilterBar } from "./filter-bar";
import { RequestList } from "./request-list";
import { DetailPanel } from "./detail-panel";

export function TimelineView(): React.ReactElement {
  const requests = useDevToolsStore((s) => s.requests);
  const {
    filters, selectedId, showFilters, detailTab,
    setFilter, resetFilters, selectRequest, toggleFilters, setDetailTab,
  } = useTimelineSearch();

  const filtered = useMemo(() => filterRequests(requests, filters), [requests, filters]);
  const pinned = useMemo(() => filtered.filter((r) => r.pinned), [filtered]);
  const unpinned = useMemo(() => filtered.filter((r) => !r.pinned), [filtered]);
  const pinnedCount = useMemo(() => requests.filter((r) => r.pinned).length, [requests]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  // Escape closes detail panel
  useEscapeClose(selectedId, selectRequest);

  const handleSearchChange = useCallback(
    (value: string) => setFilter("search", value),
    [setFilter],
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
    <div className="flex flex-1 flex-col overflow-hidden">
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

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={selectedRequest ? 55 : 100} minSize={30}>
          <RequestList
            requests={unpinned}
            pinnedRequests={pinned}
            selectedId={selectedId}
            onSelect={selectRequest}
          />
        </ResizablePanel>

        {selectedRequest && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={25}>
              <DetailPanel
                request={selectedRequest}
                activeTab={detailTab}
                onTabChange={setDetailTab}
                onClose={() => selectRequest(null)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

function useEscapeClose(
  selectedId: string | null,
  selectRequest: (id: string | null) => void,
): void {
  useEffect(() => {
    if (!selectedId) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") selectRequest(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectRequest]);
}
