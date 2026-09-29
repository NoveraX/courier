import { useMemo } from "react";
import type { FilterConfig, FilterOption } from "@/components/shared/filter-bar";
import { FilterBar } from "@/components/shared/filter-bar";
import { extractUniqueValues } from "@/lib/filter-utils";
import type { MockRequestLog } from "@/store/mock-slice";
import type { LogFilterState } from "./use-log-filter";

interface LogsFilterBarProps {
  logs: readonly MockRequestLog[];
  filters: LogFilterState;
  onFilterChange: (key: string, values: string[]) => void;
  onReset: () => void;
}

export function LogsFilterBar({
  logs,
  filters,
  onFilterChange,
  onReset,
}: LogsFilterBarProps): React.ReactElement {
  const filterConfigs = useMemo(() => buildFilterConfigs(logs), [logs]);

  const values: Record<string, string[]> = {
    method: filters.method,
    statusRange: filters.statusRange,
    group: filters.group,
  };

  return (
    <div className="flex h-11 shrink-0 items-center border-b border-border-subtle px-3">
      <FilterBar
        filters={filterConfigs}
        values={values}
        onChange={onFilterChange}
        onReset={onReset}
      />
    </div>
  );
}

const STATUS_RANGE_OPTIONS: FilterOption[] = [
  { value: "2xx", label: "2xx Success" },
  { value: "3xx", label: "3xx Redirect" },
  { value: "4xx", label: "4xx Client" },
  { value: "5xx", label: "5xx Server" },
];

function buildFilterConfigs(logs: readonly MockRequestLog[]): FilterConfig[] {
  return [
    { key: "statusRange", label: "Status", options: STATUS_RANGE_OPTIONS },
    {
      key: "method",
      label: "Method",
      options: extractUniqueValues(logs, (l) => l.httpMethod),
      searchable: true,
    },
    {
      key: "group",
      label: "Group",
      options: extractUniqueValues(logs, (l) => l.group),
      searchable: true,
    },
  ];
}
