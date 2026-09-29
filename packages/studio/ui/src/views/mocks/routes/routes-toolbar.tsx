import { useMemo } from "react";
import type { FilterConfig } from "@/components/shared/filter-bar";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import type { MockRouteEntry } from "@/store/mock-slice";
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

interface RoutesToolbarProps {
  filter: RoutesFilter;
  routes: MockRouteEntry[];
}

export function RoutesToolbar({ filter, routes }: RoutesToolbarProps): React.ReactElement {
  const groupOptions = useMemo(() => {
    const groups = new Set(routes.map((r) => r.group));
    return Array.from(groups)
      .sort()
      .map((g) => ({ value: g, label: g }));
  }, [routes]);

  const filters: FilterConfig[] = useMemo(
    () => [
      { key: "method", label: "Method", options: METHOD_OPTIONS },
      { key: "group", label: "Group", options: groupOptions },
      { key: "source", label: "Source", options: SOURCE_OPTIONS },
    ],
    [groupOptions],
  );

  const badge =
    filter.filtered.length === filter.total
      ? `${filter.total}`
      : `${filter.filtered.length}/${filter.total}`;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SearchInput
        value={filter.state.search}
        onChange={filter.setSearch}
        placeholder="Search routes..."
        badge={badge}
      />
      <FilterBar
        filters={filters}
        values={{
          method: filter.state.method,
          group: filter.state.group,
          source: filter.state.source,
        }}
        onChange={filter.setFilter}
        onReset={filter.resetFilters}
      />
    </div>
  );
}
