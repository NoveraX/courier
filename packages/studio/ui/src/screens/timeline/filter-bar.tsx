import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  CircleDot,
  Database,
  Folder,
  RadioTower,
  Shuffle,
  Tag,
} from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { DIMENSION_META, filterOptions, viewCounts } from "@/features/requests/filter-options";
import { groupTreeOptions } from "@/features/requests/group-tree-options";
import type {
  FilterDimension,
  TimelineFilter,
  TimelineView,
} from "@/features/requests/timeline-filter";
import {
  activeFilterCount,
  FILTER_DIMENSIONS,
  NO_SELECTION,
} from "@/features/requests/timeline-filter";
import { useStudioStore } from "@/store";
import { FilterMenu } from "./filter-menu";

const ICONS: Readonly<Record<FilterDimension, LucideIcon>> = {
  status: CircleDot,
  method: ArrowRightLeft,
  transport: RadioTower,
  source: Database,
  group: Folder,
  mode: Shuffle,
  type: Tag,
};

const VIEW_LABELS: Readonly<Record<TimelineView, string>> = {
  all: "All",
  errors: "Errors",
  slow: "Slow",
  pending: "In flight",
};

interface FilterBarProps {
  filter: TimelineFilter;
  onChange: (next: TimelineFilter) => void;
  /** What ends the row: on a phone, how many requests show. */
  aside?: React.ReactNode;
}

/**
 * The Timeline's filters: the quick views with their counts, a menu per
 * filter, and Reset all once anything is chosen. On a phone they stay on
 * one row, which scrolls sideways.
 *
 * @param props - What the Timeline shows, what changes it, and what ends the row
 * @returns The bar
 * @example
 * ```tsx
 * <FilterBar filter={filter} onChange={setFilter} />
 * ```
 */
export function FilterBar({ filter, onChange, aside }: FilterBarProps): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const counts = viewCounts(requests, filter, slowMs);
  const views: SegmentedOption<TimelineView>[] = (
    ["all", "errors", "slow", "pending"] as const
  ).map((view) => ({
    value: view,
    label: VIEW_LABELS[view],
    count: counts[view],
    countTone: view === "errors" ? "err" : "subtle",
  }));
  /* Groups inside groups are offered as a tree, each under the group it sits in. */
  const optionsOf = (dimension: FilterDimension) => {
    const options = filterOptions(requests, filter, dimension, slowMs);
    return dimension === "group" ? groupTreeOptions(options) : options;
  };
  const choose = (dimension: FilterDimension, chosen: string[]) =>
    onChange({ ...filter, selected: { ...filter.selected, [dimension]: chosen } });
  const changed = activeFilterCount(filter) > 0;
  return (
    <div className="flex min-h-11.5 shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-bg-subtle py-2 pr-4 pl-5 max-sm:scroll-row max-sm:flex-nowrap max-sm:pl-4">
      <Segmented
        label="View"
        options={views}
        value={filter.view}
        onChange={(view) => onChange({ ...filter, view })}
      />
      <span aria-hidden="true" className="mx-1.5 h-4.5 w-px shrink-0 bg-line" />
      {FILTER_DIMENSIONS.map((dimension) => (
        <FilterMenu
          key={dimension}
          label={DIMENSION_META[dimension].label}
          icon={ICONS[dimension]}
          mono={DIMENSION_META[dimension].mono}
          options={optionsOf(dimension)}
          chosen={filter.selected[dimension]}
          onChange={(chosen) => choose(dimension, chosen)}
        />
      ))}
      {changed && (
        <button
          type="button"
          onClick={() => onChange({ ...filter, view: "all", selected: NO_SELECTION })}
          className="h-7 shrink-0 cursor-pointer px-2 text-small font-strong whitespace-nowrap text-brand pointer-coarse:h-9"
        >
          Reset all
        </button>
      )}
      {aside}
    </div>
  );
}
