import { useMemo } from "react";

import { CountDisplay } from "@/components/shared/count-display";
import { SearchInput } from "@/components/shared/search-input";
import { FilterBar as SharedFilterBar } from "@/components/shared/filter-bar";

import type { EndpointNodeData } from "../types";
import type { EndpointFilters } from "./endpoints-filters";
import { buildFilterConfigs } from "./endpoints-filters";

// ── Props ──────────────────────────────────────────────────────────────────

interface EndpointsToolbarProps {
  endpoints: EndpointNodeData[];
  filters: EndpointFilters;
  total: number;
  filtered: number;
  onFilterChange: <K extends keyof EndpointFilters>(key: K, value: EndpointFilters[K]) => void;
  onReset: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function EndpointsToolbar({
  endpoints,
  filters,
  total,
  filtered,
  onFilterChange,
  onReset,
}: EndpointsToolbarProps): React.ReactElement {
  const filterConfigs = useMemo(
    () => buildFilterConfigs(endpoints),
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
      {/* Search */}
      <SearchInput
        value={filters.search}
        onChange={(v) => onFilterChange("search", v)}
        placeholder="Search endpoints..."
      />

      {/* Filter buttons (popover + checkboxes) */}
      <SharedFilterBar
        filters={filterConfigs}
        values={values}
        onChange={(key, selected) =>
          onFilterChange(key as keyof EndpointFilters, selected as never)
        }
        onReset={onReset}
      />

      <div className="flex-1" />

      <CountDisplay filtered={filtered} total={total} label="endpoints" />
    </div>
  );
}
