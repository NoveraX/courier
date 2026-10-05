import { Download, History, Pin, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SearchField } from "@/design/search-field";
import { Skeleton } from "@/design/skeleton";
import { exportShownRequests } from "@/features/sessions/export-requests";
import { useClearRequests } from "@/hooks/use-clear-requests";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

const TOOL =
  "flex h-7.5 shrink-0 cursor-pointer items-center gap-1.75 rounded-control border px-2.5 text-control transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand";

interface TimelineToolbarProps {
  search: string;
  onSearch: (search: string) => void;
  filtersShown: boolean;
  onToggleFilters: () => void;
  activeFilters: number;
  shown: number;
}

/**
 * The bar over the Timeline: the search, the filters' switch, Preserve log
 * and Clear, how many requests show, and Export.
 *
 * @param props - The search, the filters' state, and how many requests show
 * @returns The bar
 * @example
 * ```tsx
 * <TimelineToolbar search={q} onSearch={setQ} filtersShown onToggleFilters={toggle} activeFilters={2} shown={40} />
 * ```
 */
export function TimelineToolbar(props: TimelineToolbarProps): React.ReactNode {
  const { search, onSearch, filtersShown, onToggleFilters, activeFilters, shown } = props;
  const total = useStudioStore((s) => s.requests.length);
  const loading = useFirstLoad();
  const pinned = useStudioStore((s) => s.requests.filter((r) => r.pinned).length);
  const preserve = useStudioStore((s) => s.settings.preserveLog);
  const togglePreserve = useStudioStore((s) => s.togglePreserveLog);
  const format = useStudioStore((s) => s.settings.defaultExportFormat);
  const clear = useClearRequests();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-4 pl-5">
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder="Filter by endpoint, path or status…"
        label="Filter requests"
        className="w-80 max-w-[34%]"
      />
      <button
        type="button"
        aria-pressed={filtersShown}
        onClick={onToggleFilters}
        className={cn(
          TOOL,
          filtersShown ? "border-line-strong bg-raised text-fg" : "border-line text-fg-muted",
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="size-3.25" />
        Filters
        {activeFilters > 0 && (
          <span className="inline-flex h-4.25 min-w-4.25 items-center justify-center rounded-full bg-brand px-1 text-meta font-semibold text-bg">
            {activeFilters}
          </span>
        )}
      </button>
      <span aria-hidden="true" className="mx-1 h-4.5 w-px bg-line" />
      <button
        type="button"
        aria-pressed={preserve}
        title="Keep pinned requests when the log is cleared"
        onClick={togglePreserve}
        className={cn(
          TOOL,
          preserve ? "border-brand/40 bg-brand-dim text-brand" : "border-line text-fg-muted",
        )}
      >
        <History aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Preserve log</span>
      </button>
      <button
        type="button"
        title="Clear the requests"
        onClick={() => {
          clear();
          toast.success(preserve ? "Cleared · pinned kept" : "Cleared");
        }}
        className={cn(TOOL, "border-line text-fg-muted hover:text-fg")}
      >
        <Trash2 aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Clear</span>
      </button>
      <span className="flex-1" />
      {pinned > 0 && (
        <span className="flex h-5.5 items-center gap-1.25 rounded-full bg-syntax-keyword/12 px-2 text-label font-strong text-syntax-keyword">
          <Pin aria-hidden="true" className="size-2.75" />
          {pinned}
        </span>
      )}
      {loading.requests ? (
        <Skeleton className="h-3 w-20" />
      ) : (
        <span className="text-control whitespace-nowrap text-fg-subtle tabular-nums">
          {shown === total ? (
            <>
              <span className="font-strong text-fg">{total}</span> requests
            </>
          ) : (
            <>
              <span className="font-strong text-fg">{shown}</span> of {total} requests
            </>
          )}
        </span>
      )}
      <button
        type="button"
        title={`Export the requests as ${format.toUpperCase()}`}
        disabled={total === 0}
        onClick={() => void exportShownRequests(format)}
        className={cn(
          TOOL,
          "border-line text-fg-muted hover:text-fg disabled:cursor-default disabled:opacity-50",
        )}
      >
        <Download aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Export</span>
      </button>
    </div>
  );
}
