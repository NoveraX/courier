import { ArrowDownWideNarrow, Layers, Minus, Plus, Search, X } from "lucide-react";

import type { Choice } from "@/design/choice-menu";
import { ChoiceMenu } from "@/design/choice-menu";
import { Segmented } from "@/design/segmented";
import type {
  WaterfallGroup,
  WaterfallMode,
  WaterfallSort,
  WaterfallView,
} from "@/features/waterfall/waterfall-search";
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
  return (
    <div className="flex min-h-12.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5">
      <label className="flex h-7.5 max-w-85 flex-[1_1_220px] items-center gap-2 rounded-control border border-line bg-panel pr-1 pl-2.5">
        <Search aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
        <input
          value={view.q}
          onChange={(e) => onView({ q: e.target.value })}
          placeholder="Filter endpoints…"
          aria-label="Filter endpoints"
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
        {view.q && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => onView({ q: "" })}
            className="flex cursor-pointer text-fg-subtle hover:text-fg"
          >
            <X aria-hidden="true" className="size-3.25" />
          </button>
        )}
        <span className="flex h-5.5 shrink-0 items-center rounded-[5px] bg-raised px-1.75 text-badge whitespace-nowrap text-fg-subtle tabular-nums">
          <span className="font-semibold text-fg">{shown}</span>&nbsp;/ {total}
        </span>
      </label>
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
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full bg-current",
              following ? "animate-pulse-live" : "opacity-40",
            )}
          />
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
