import type { EndpointNodeData } from "../types";

// ── Filter state (multi-select arrays, matching Timeline pattern) ──────────

export interface EndpointFilters {
  search: string;
  source: string[];
  group: string[];
  endpointType: string[];
  httpMethod: string[];
}

export const EMPTY_FILTERS: EndpointFilters = {
  search: "",
  source: [],
  group: [],
  endpointType: [],
  httpMethod: [],
};

// ── Filter pipeline ────────────────────────────────────────────────────────

export function applyFilters(
  endpoints: EndpointNodeData[],
  filters: EndpointFilters,
): EndpointNodeData[] {
  let result = endpoints;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (ep) =>
        ep.method.toLowerCase().includes(q) ||
        ep.fullPath.toLowerCase().includes(q) ||
        ep.group.toLowerCase().includes(q),
    );
  }

  if (filters.source.length > 0) {
    result = result.filter((ep) => filters.source.includes(ep.source));
  }

  if (filters.group.length > 0) {
    result = result.filter((ep) => filters.group.includes(ep.group));
  }

  if (filters.endpointType.length > 0) {
    result = result.filter((ep) => filters.endpointType.includes(ep.endpointType));
  }

  if (filters.httpMethod.length > 0) {
    result = result.filter((ep) => filters.httpMethod.includes(ep.httpMethod));
  }

  return result;
}

// ── Extract unique filter options from data ────────────────────────────────

import type { FilterOption } from "@/components/shared/filter-bar";
import type { FilterConfig } from "@/components/shared/filter-bar";

export function buildFilterConfigs(
  endpoints: EndpointNodeData[],
): FilterConfig[] {
  return [
    { key: "source", label: "Source", options: extractUnique(endpoints, "source"), searchable: true },
    { key: "group", label: "Group", options: extractUnique(endpoints, "group"), searchable: true },
    { key: "endpointType", label: "Type", options: TYPE_OPTIONS },
    { key: "httpMethod", label: "HTTP", options: extractUnique(endpoints, "httpMethod") },
  ];
}

const TYPE_OPTIONS: FilterOption[] = [
  { value: "query", label: "Query" },
  { value: "mutation", label: "Mutation" },
  { value: "untyped", label: "Untyped" },
];

function extractUnique(
  endpoints: EndpointNodeData[],
  field: "source" | "group" | "httpMethod",
): FilterOption[] {
  const values = new Set<string>();
  for (const ep of endpoints) {
    const v = ep[field];
    if (v) values.add(v);
  }
  return [...values].sort().map((v) => ({ value: v, label: v }));
}

// ── Check active filters ───────────────────────────────────────────────────

export function hasActiveFilters(filters: EndpointFilters): boolean {
  return (
    filters.source.length > 0 ||
    filters.group.length > 0 ||
    filters.endpointType.length > 0 ||
    filters.httpMethod.length > 0
  );
}
