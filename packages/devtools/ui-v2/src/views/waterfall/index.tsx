import { useCallback, useRef } from "react";
import { Timer } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatDuration } from "@/components/shared/formatters";
import { useRequestDetail } from "@/hooks/use-request-detail";
import { useDevToolsStore } from "@/store";

import { SegmentLegend } from "./segment-legend";
import { Toolbar } from "./toolbar";
import { WaterfallCanvas } from "./waterfall-canvas";
import { useWaterfall } from "./use-waterfall";

export function WaterfallView(): React.ReactElement {
  const requests = useDevToolsStore((s) => s.requests);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { selectedId, selectRequest } = useRequestDetail();

  const {
    rows, groups, gaps, timeSpan, actualTimeSpan, zoom,
    sortBy, groupBy, modeFilter, search,
    setSortBy, setGroupBy, setModeFilter, setSearch,
    zoomIn, zoomOut, resetZoom, zoomToFit, handleWheelZoom,
  } = useWaterfall(requests);

  const handleZoomToFit = useCallback(() => {
    const width = scrollRef.current?.clientWidth ?? 0;
    zoomToFit(timeSpan, width);
  }, [timeSpan, zoomToFit]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={Timer}
          heading="No requests yet"
          description="Make API calls from your app to see the timing waterfall."
        />
      </div>
    );
  }

  const showGroups = groupBy !== "none";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Toolbar
        search={search}
        sortBy={sortBy}
        groupBy={groupBy}
        modeFilter={modeFilter}
        zoom={zoom.scale}
        totalCount={requests.length}
        filteredCount={rows.length}
        onSearchChange={setSearch}
        onSortChange={setSortBy}
        onGroupChange={setGroupBy}
        onModeChange={setModeFilter}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onZoomToFit={handleZoomToFit}
      />

      {/* Time span indicator */}
      {timeSpan > 0 && (
        <div className="flex h-6 items-center gap-4 border-b border-border-subtle bg-background-inset/30 px-3">
          <span className="shrink-0 text-caption text-muted-foreground">
            {rows.length} requests over {formatDuration(actualTimeSpan)}
          </span>
          <SegmentLegend rows={rows} />
          {modeFilter !== "all" && (
            <span className="ml-auto shrink-0 text-caption text-muted-foreground">
              Showing {modeFilter} only
            </span>
          )}
        </div>
      )}

      <WaterfallCanvas
        groups={groups}
        rows={rows}
        gaps={gaps}
        timeSpan={timeSpan}
        zoom={zoom}
        scrollRef={scrollRef}
        selectedId={selectedId}
        showGroups={showGroups}
        onSelect={(id) => id && selectRequest(id)}
        onWheelZoom={handleWheelZoom}
      />
    </div>
  );
}
