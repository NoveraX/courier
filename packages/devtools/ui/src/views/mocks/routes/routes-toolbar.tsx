import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";

import type { FilterConfig } from "@/components/shared/filter-bar";
import type { RoutesFilter } from "./use-routes-filter";

const METHOD_OPTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({
  value: m,
  label: m,
}));

const SOURCE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "override", label: "Override" },
  { value: "scenario", label: "Scenario" },
];

const FILTERS: FilterConfig[] = [
  { key: "method", label: "Method", options: METHOD_OPTIONS },
  { key: "source", label: "Source", options: SOURCE_OPTIONS },
];

interface RoutesToolbarProps {
  filter: RoutesFilter;
}

export function RoutesToolbar({ filter }: RoutesToolbarProps): React.ReactElement {
  const badge = filter.filtered.length === filter.total
    ? `${filter.total}`
    : `${filter.filtered.length}/${filter.total}`;

  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5">
      <SearchInput
        value={filter.state.search}
        onChange={filter.setSearch}
        placeholder="Search routes..."
        badge={badge}
      />
      <FilterBar
        filters={FILTERS}
        values={{ method: filter.state.method, source: filter.state.source }}
        onChange={filter.setFilter}
        onReset={filter.resetFilters}
      />
    </div>
  );
}
