import { useMemo } from "react";

import { FilterBar as SharedFilterBar } from "@/components/shared/filter-bar";
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
    <div className="border-b border-border-subtle px-3 py-2">
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
    { key: "httpMethod", label: "Method", options: extractMethods(requests), searchable: true },
    { key: "source", label: "Source", options: extractUnique(requests, "source"), searchable: true },
    { key: "group", label: "Group", options: extractGroups(requests), searchable: true },
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

function extractMethods(requests: readonly RequestEntry[]): FilterOption[] {
  const methods = new Set<string>();
  for (const r of requests) {
    if (r.httpMethod) methods.add(r.httpMethod);
  }
  return Array.from(methods)
    .sort()
    .map((m) => ({ value: m, label: m }));
}

function extractUnique(requests: readonly RequestEntry[], field: "source"): FilterOption[] {
  const values = new Set<string>();
  for (const r of requests) {
    values.add(r[field]);
  }
  return Array.from(values)
    .sort()
    .map((v) => ({ value: v, label: v }));
}

function extractGroups(requests: readonly RequestEntry[]): FilterOption[] {
  const groups = new Set<string>();
  for (const r of requests) {
    if (r.group) groups.add(r.group);
  }
  return Array.from(groups)
    .sort()
    .map((g) => ({ value: g, label: g }));
}
