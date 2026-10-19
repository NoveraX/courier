import { Activity, FileInput } from "lucide-react";
import { useMemo, useState } from "react";

import { MEDIA } from "@/design/breakpoints";
import { activeFilterCount, matchesFilter } from "@/features/requests/timeline-filter";
import { pickSessionFile } from "@/features/sessions/open-session-file";
import { useSessionFileDrop } from "@/features/sessions/use-session-file-drop";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStudioStore } from "@/store";
import { FilterBar } from "./filter-bar";
import { OpenedSessionBanner } from "./opened-session-banner";
import { RequestTable } from "./request-table";
import { ThroughputStrip } from "./throughput-strip";
import { TimelineCount } from "./timeline-count";
import { TimelineSkeleton } from "./timeline-skeleton";
import { TimelineToolbar } from "./timeline-toolbar";
import { useTimelineFilter } from "./use-timeline-filter";

/* Where the filters would take the room the requests need: a phone, upright or on its side. */
const FILTERS_CLOSED = `${MEDIA.phone}, ${MEDIA.shortScreen}`;

/**
 * The Timeline: every request Studio recorded, newest first, filtered by
 * the views, filters and search its address keeps, under the last
 * minute's throughput — a request opens in the inspector. A session file
 * dropped on it opens in place of the live requests. On a phone the
 * filters start closed, and their row ends with how many requests show.
 *
 * @returns The screen
 * @example
 * ```tsx
 * export const Route = createFileRoute("/timeline")({ component: TimelineScreen });
 * ```
 */
export function TimelineScreen(): React.ReactNode {
  const { filter, setFilter, reset } = useTimelineFilter();
  const phone = useMediaQuery(MEDIA.phone);
  const cramped = useMediaQuery(FILTERS_CLOSED);
  const [filtersShown, setFiltersShown] = useState(!cramped);
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const loading = useFirstLoad();
  const drop = useSessionFileDrop();
  const shown = useMemo(
    () => requests.filter((r) => matchesFilter(r, filter, { slowMs })),
    [requests, filter, slowMs],
  );
  return (
    <div className="relative flex h-full min-h-0 flex-col" {...drop.handlers}>
      <TimelineToolbar
        search={filter.search}
        onSearch={(search) => setFilter({ ...filter, search })}
        filtersShown={filtersShown}
        onToggleFilters={() => setFiltersShown((shownNow) => !shownNow)}
        activeFilters={activeFilterCount(filter)}
        shown={shown.length}
        counted={!phone}
      />
      <OpenedSessionBanner />
      {filtersShown && (
        <FilterBar
          filter={filter}
          onChange={setFilter}
          aside={
            phone ? <TimelineCount shown={shown.length} className="ml-auto pl-1" /> : undefined
          }
        />
      )}
      {loading.requests ? (
        <TimelineSkeleton />
      ) : (
        <>
          <ThroughputStrip />
          {requests.length === 0 ? (
            <Waiting />
          ) : shown.length === 0 ? (
            <NoMatches onReset={reset} />
          ) : (
            <RequestTable requests={shown} />
          )}
        </>
      )}
      {drop.over && <DropHint />}
    </div>
  );
}

function DropHint(): React.ReactNode {
  return (
    <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-brand/60 bg-bg/85 text-center backdrop-blur-[2px]">
      <FileInput aria-hidden="true" className="size-5 text-brand" />
      <span className="text-title font-semibold">Drop to open the session file</span>
      <span className="text-ui text-fg-muted">It shows in place of the live requests.</span>
    </div>
  );
}

function Waiting(): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-20 text-center">
      <span className="text-title font-semibold">Waiting for requests</span>
      <span className="text-ui text-fg-muted">
        Make API calls from your app to see them here as they happen.
      </span>
      <span className="mt-2 text-small text-fg-subtle">
        Sent a session file? Drop it here, or{" "}
        <button
          type="button"
          onClick={pickSessionFile}
          className="relative cursor-pointer text-brand underline-offset-2 hit-area hover:underline"
        >
          open it
        </button>
        .
      </span>
    </div>
  );
}

function NoMatches({ onReset }: { onReset: () => void }): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-16 text-center">
      <Activity aria-hidden="true" className="size-4 text-fg-subtle" />
      <span className="text-title font-semibold">No requests match</span>
      <span className="text-ui text-fg-muted">Try a different search, or reset the filters.</span>
      <button
        type="button"
        onClick={onReset}
        className="h-7.5 cursor-pointer rounded-control border border-line-strong bg-panel px-3 text-control text-fg hover:border-fg-subtle pointer-coarse:h-9"
      >
        Reset filters
      </button>
    </div>
  );
}
