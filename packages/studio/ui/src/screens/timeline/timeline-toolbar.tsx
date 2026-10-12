import { History, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OverflowMenu } from "@/design/overflow-menu";
import { SearchField } from "@/design/search-field";
import { useClearRequests } from "@/hooks/use-clear-requests";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { TimelineCount } from "./timeline-count";
import { timelineMenu } from "./timeline-menu";
import { TimelineOutputs } from "./timeline-outputs";
import { TOOL } from "./toolbar-tool";

interface TimelineToolbarProps {
  search: string;
  onSearch: (search: string) => void;
  filtersShown: boolean;
  onToggleFilters: () => void;
  activeFilters: number;
  shown: number;
  /** Whether the bar shows how many requests show: a phone's shows it at the filters' end. */
  counted: boolean;
}

/**
 * The bar over the Timeline: the search, the filters' switch, Preserve log
 * and Clear, how many requests show, and what the requests become — an
 * export, a session file, a test. A phone's bar keeps the search and the
 * filters' switch, and the rest in its "⋯" menu.
 *
 * @param props - The search, the filters' state, how many requests show, and whether the bar counts them
 * @returns The bar
 * @example
 * ```tsx
 * <TimelineToolbar search={q} onSearch={setQ} filtersShown onToggleFilters={toggle} activeFilters={2} shown={40} counted />
 * ```
 */
export function TimelineToolbar(props: TimelineToolbarProps): React.ReactNode {
  const { search, onSearch, filtersShown, onToggleFilters, activeFilters, shown, counted } = props;
  const total = useStudioStore((s) => s.requests.length);
  const preserve = useStudioStore((s) => s.settings.preserveLog);
  const togglePreserve = useStudioStore((s) => s.togglePreserveLog);
  const format = useStudioStore((s) => s.settings.defaultExportFormat);
  const clearRequests = useClearRequests();
  const clear = () => {
    clearRequests();
    toast.success(preserve ? "Cleared · pinned kept" : "Cleared");
  };
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-4 pl-5 max-sm:pl-4">
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder="Filter by endpoint, path or status…"
        label="Filter requests"
        className="w-80 max-w-[34%] max-sm:w-auto max-sm:max-w-none max-sm:min-w-0 max-sm:flex-1"
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
      <span aria-hidden="true" className="mx-1 h-4.5 w-px bg-line max-sm:hidden" />
      <button
        type="button"
        aria-pressed={preserve}
        title="Keep pinned requests when the log is cleared"
        onClick={togglePreserve}
        className={cn(
          TOOL,
          "max-sm:hidden",
          preserve ? "border-brand/40 bg-brand-dim text-brand" : "border-line text-fg-muted",
        )}
      >
        <History aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Preserve log</span>
      </button>
      <button
        type="button"
        title="Clear the requests"
        onClick={clear}
        className={cn(TOOL, "border-line text-fg-muted hover:text-fg max-sm:hidden")}
      >
        <Trash2 aria-hidden="true" className="size-3.25" />
        <span className="max-[1100px]:hidden">Clear</span>
      </button>
      <span className="flex-1 max-sm:hidden" />
      {counted && <TimelineCount shown={shown} />}
      <TimelineOutputs total={total} format={format} />
      <OverflowMenu
        label="More actions"
        className="sm:hidden"
        actions={timelineMenu({
          preserve,
          onPreserve: togglePreserve,
          onClear: clear,
          total,
          format,
        })}
      />
    </div>
  );
}
