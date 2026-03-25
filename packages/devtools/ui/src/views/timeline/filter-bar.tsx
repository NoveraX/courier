import { useMemo } from "react";

import { FilterBar as SharedFilterBar } from "@/components/shared/filter-bar";
import { extractUniqueValues } from "@/lib/filter-utils";

import type { FilterConfig } from "@/components/shared/filter-bar";
import type { FilterOption } from "@/components/shared/filter-bar";
import type { RequestEntry } from "@/store/types";
import type { TimelineFilters } from "@/store/types";

interface TimelineFilterBarProps {
  requests: readonly RequestEntry[];
  filters: TimelineFilters;
  onFilterChange: <K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => void;
  onReset: () => void;
}

export function TimelineFilterBar({
  requests,
  filters,
  onFilterChange,
  onReset,
}: TimelineFilterBarProps): React.ReactElement {
  const filterConfigs = useMemo(() => buildFilterConfigs(requests), [requests]);

  const values: Record<string, string[]> = {
    status: filters.status,
    mode: filters.mode,
    type: filters.type,
    httpMethod: filters.httpMethod,
    source: filters.source,
    group: filters.group,
  };

  return (
    <div className="flex h-11 shrink-0 items-center border-b border-border-subtle px-3">
      <SharedFilterBar
        filters={filterConfigs}
        values={values}
        onChange={(key, selected) =>
          onFilterChange(key as keyof TimelineFilters, selected as never)
        }
        onReset={onReset}
      />
    </div>
  );
}

function buildFilterConfigs(requests: readonly RequestEntry[]): FilterConfig[] {
  return [
    { key: "status", label: "Status", options: STATUS_OPTIONS },
    { key: "mode", label: "Mode", options: MODE_OPTIONS },
    { key: "type", label: "Type", options: TYPE_OPTIONS },
    { key: "httpMethod", label: "Method", options: extractUniqueValues(requests, (r) => r.httpMethod), searchable: true },
    { key: "source", label: "Source", options: extractUniqueValues(requests, (r) => r.source), searchable: true },
    { key: "group", label: "Group", options: extractUniqueValues(requests, (r) => r.group), searchable: true },
  ];
}

const STATUS_OPTIONS: FilterOption[] = [
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "pending", label: "Pending" },
  { value: "aborted", label: "Aborted" },
  { value: "validation_error", label: "Validation Error" },
];

const MODE_OPTIONS: FilterOption[] = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
];

const TYPE_OPTIONS: FilterOption[] = [
  { value: "query", label: "Query" },
  { value: "mutation", label: "Mutation" },
];
