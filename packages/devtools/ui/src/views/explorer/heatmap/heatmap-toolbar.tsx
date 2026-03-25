import { useMemo } from "react";

import { CountDisplay } from "@/components/shared/count-display";
import { SearchInput } from "@/components/shared/search-input";
import { FilterBar as SharedFilterBar } from "@/components/shared/filter-bar";
import { SingleSelect } from "@/components/shared/single-select";

import type { EndpointNodeData } from "../types";
import type { HeatmapFilters } from "./heatmap-filters";
import type { TimingSort } from "./timing-types";
import { buildHeatmapFilterConfigs } from "./heatmap-filters";

import type { SingleSelectOption } from "@/components/shared/single-select";

// ── Sort options ───────────────────────────────────────────────────────────

const SORT_OPTIONS: SingleSelectOption[] = [
  { value: "total", label: "Total time" },
  { value: "fetch", label: "Fetch time" },
  { value: "middleware", label: "Middleware time" },
  { value: "validation", label: "Validation time" },
  { value: "setup", label: "Setup time" },
];

// ── Props ──────────────────────────────────────────────────────────────────

interface HeatmapToolbarProps {
  endpoints: EndpointNodeData[];
  filters: HeatmapFilters;
  onFilterChange: <K extends keyof HeatmapFilters>(key: K, value: HeatmapFilters[K]) => void;
  onReset: () => void;
  sort: TimingSort;
  onSortChange: (sort: TimingSort) => void;
  total: number;
  filtered: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function HeatmapToolbar({
  endpoints,
  filters,
  onFilterChange,
  onReset,
  sort,
  onSortChange,
  total,
  filtered,
}: HeatmapToolbarProps): React.ReactElement {
  const filterConfigs = useMemo(
    () => buildHeatmapFilterConfigs(endpoints),
    [endpoints],
  );

  const values: Record<string, string[]> = {
    source: filters.source,
    group: filters.group,
    endpointType: filters.endpointType,
    httpMethod: filters.httpMethod,
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SearchInput
        value={filters.search}
        onChange={(v) => onFilterChange("search", v)}
        placeholder="Search endpoints..."
      />

      <SingleSelect
        options={SORT_OPTIONS}
        value={sort}
        onChange={(v) => onSortChange(v as TimingSort)}
      />

      <SharedFilterBar
        filters={filterConfigs}
        values={values}
        onChange={(key, selected) =>
          onFilterChange(key as keyof HeatmapFilters, selected as never)
        }
        onReset={onReset}
      />

      <div className="flex-1" />

      <CountDisplay filtered={filtered} total={total} label="endpoints" />
    </div>
  );
}
