import { Activity } from "lucide-react";
import { useMemo, useState } from "react";

import { activeFilterCount, matchesFilter } from "@/features/requests/timeline-filter";
import { useStudioStore } from "@/store";
import { FilterBar } from "./filter-bar";
import { RequestTable } from "./request-table";
import { ThroughputStrip } from "./throughput-strip";
import { TimelineToolbar } from "./timeline-toolbar";
import { useTimelineFilter } from "./use-timeline-filter";

/**
 * The Timeline: every request Studio recorded, newest first, filtered by
 * the views, filters and search its address keeps, under the last
 * minute's throughput — a request opens in the inspector.
 *
 * @returns The screen
 * @example
 * ```tsx
 * export const Route = createFileRoute("/next/timeline")({ component: TimelineScreen });
 * ```
 */
export function TimelineScreen(): React.ReactNode {
  const { filter, setFilter, reset } = useTimelineFilter();
  const [filtersShown, setFiltersShown] = useState(true);
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const shown = useMemo(
    () => requests.filter((r) => matchesFilter(r, filter, { slowMs })),
    [requests, filter, slowMs],
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TimelineToolbar
        search={filter.search}
        onSearch={(search) => setFilter({ ...filter, search })}
        filtersShown={filtersShown}
        onToggleFilters={() => setFiltersShown((shownNow) => !shownNow)}
        activeFilters={activeFilterCount(filter)}
        shown={shown.length}
      />
      {filtersShown && <FilterBar filter={filter} onChange={setFilter} />}
      <ThroughputStrip />
      {requests.length === 0 ? (
        <Waiting />
      ) : shown.length === 0 ? (
        <NoMatches onReset={reset} />
      ) : (
        <RequestTable requests={shown} />
      )}
    </div>
  );
}

function Waiting(): React.ReactNode {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-20 text-center">
      <span aria-hidden="true" className="size-2 animate-pulse-live rounded-full bg-brand" />
      <span className="text-title font-semibold">Waiting for requests</span>
      <span className="text-ui text-fg-muted">
        Make API calls from your app to see them here as they happen.
      </span>
    </div>
  );
}

function NoMatches({ onReset }: { onReset: () => void }): React.ReactNode {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-16 text-center">
      <Activity aria-hidden="true" className="size-4 text-fg-subtle" />
      <span className="text-title font-semibold">No requests match</span>
      <span className="text-ui text-fg-muted">Try a different search, or reset the filters.</span>
      <button
        type="button"
        onClick={onReset}
        className="h-7.5 cursor-pointer rounded-control border border-line-strong bg-panel px-3 text-control text-fg hover:border-fg-subtle"
      >
        Reset filters
      </button>
    </div>
  );
}
