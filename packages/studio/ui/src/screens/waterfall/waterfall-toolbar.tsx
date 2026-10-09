import { ArrowDownWideNarrow, Layers, Minus, Plus } from "lucide-react";

import type { Choice } from "@/design/choice-menu";
import { ChoiceMenu } from "@/design/choice-menu";
import { SearchField } from "@/design/search-field";
import { Segmented } from "@/design/segmented";
import { Skeleton } from "@/design/skeleton";
import type {
  WaterfallGroup,
  WaterfallMode,
  WaterfallSort,
  WaterfallView,
} from "@/features/waterfall/waterfall-search";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";

const SORTS: readonly Choice<WaterfallSort>[] = [
  { value: "start", label: "Start time" },
  { value: "duration", label: "Duration" },
  { value: "size", label: "Size" },
];

const GROUPS: readonly Choice<WaterfallGroup>[] = [
  { value: "none", label: "None" },
  { value: "source", label: "Source" },
  { value: "group", label: "Group" },
];

const MODES = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "webhook", label: "Webhook" },
] as const satisfies readonly { value: WaterfallMode; label: string }[];

const ZOOM_BUTTON =
  "flex w-7.5 cursor-pointer items-center justify-center text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

export interface WaterfallToolbarProps {
  view: WaterfallView;
  onView: (patch: Partial<WaterfallView>) => void;
  shown: number;
  total: number;
  following: boolean;
  onFollow: () => void;
  zoomLabel: string;
  onZoom: (step: "in" | "out" | "fit") => void;
}

/**
 * The bar over the Waterfall: the search with what it shows of all
 * captured, the sort, the grouping and the mode, whether it follows the
 * newest requests, and its zoom.
 *
 * @param props - The view, the counts, following and zoom, and what changes them
 * @returns The toolbar
 * @example
 * ```tsx
 * <WaterfallToolbar view={view} onView={setView} shown={25} total={47} following onFollow={toggle} zoomLabel="Auto" onZoom={zoom} />
 * ```
 */
export function WaterfallToolbar(props: WaterfallToolbarProps): React.ReactNode {
  const { view, onView, shown, total, following, onFollow, zoomLabel, onZoom } = props;
  const loading = useFirstLoad();
  return (
    <div className="flex min-h-12.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5">
      <SearchField
        value={view.q}
        onChange={(q) => onView({ q })}
        placeholder="Filter endpoints…"
        label="Filter endpoints"
        className="max-w-85 flex-[1_1_220px] pr-1"
      >
        {loading.requests ? (
          <Skeleton className="h-5.5 w-12 rounded-[5px]" />
        ) : (
          <span className="flex h-5.5 shrink-0 items-center rounded-[5px] bg-raised px-1.75 text-badge whitespace-nowrap text-fg-subtle tabular-nums">
            <span className="font-semibold text-fg">{shown}</span>&nbsp;/ {total}
          </span>
        )}
      </SearchField>
      <ChoiceMenu
        icon={ArrowDownWideNarrow}
        label="Sort"
        choices={SORTS}
        value={view.sort}
        onChange={(sort) => onView({ sort })}
      />
      <ChoiceMenu
        icon={Layers}
        label="Group"
        choices={GROUPS}
        value={view.group}
        onChange={(group) => onView({ group })}
      />
      <Segmented
        label="Mode"
        options={MODES}
        value={view.mode}
        onChange={(mode) => onView({ mode })}
        quiet="subtle"
      />
      <div className="flex-1" />
      <div className="flex h-7.5 items-stretch overflow-hidden rounded-card border border-line bg-panel">
        <button
          type="button"
          title="Keep the newest requests in view"
          aria-pressed={following}
          onClick={onFollow}
          className={cn(
            "flex cursor-pointer items-center gap-1.75 border-r border-line px-2.75 text-control font-strong whitespace-nowrap transition-colors",
            following ? "bg-brand-dim text-brand" : "text-fg-muted hover:text-fg",
          )}
        >
          Follow
        </button>
        <button
          type="button"
          title="Zoom out · −"
          aria-label="Zoom out"
          onClick={() => onZoom("out")}
          className={ZOOM_BUTTON}
        >
          <Minus aria-hidden="true" className="size-3.25" />
        </button>
        <button
          type="button"
          title="Reset to auto zoom · 0"
          onClick={() => onZoom("fit")}
          className="min-w-13 cursor-pointer border-x border-line px-1.5 font-mono text-label text-fg transition-colors hover:bg-raised"
        >
          {zoomLabel}
        </button>
        <button
          type="button"
          title="Zoom in · +"
          aria-label="Zoom in"
          onClick={() => onZoom("in")}
          className={ZOOM_BUTTON}
        >
          <Plus aria-hidden="true" className="size-3.25" />
        </button>
      </div>
    </div>
  );
}
