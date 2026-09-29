import type { FilterConfig, FilterOption } from "@/components/shared/filter-bar";
import { extractUniqueValues } from "@/lib/filter-utils";
import type { EndpointNodeData } from "../types";

// ── Filter state ───────────────────────────────────────────────────────────

export interface HeatmapFilters {
  search: string;
  source: string[];
  group: string[];
  endpointType: string[];
  httpMethod: string[];
}

export const EMPTY_HEATMAP_FILTERS: HeatmapFilters = {
  search: "",
  source: [],
  group: [],
  endpointType: [],
  httpMethod: [],
};

// ── Filter pipeline ────────────────────────────────────────────────────────

export function applyHeatmapFilters(
  endpoints: EndpointNodeData[],
  filters: HeatmapFilters,
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

// ── Build filter configs from data ─────────────────────────────────────────

const TYPE_OPTIONS: FilterOption[] = [
  { value: "query", label: "Query" },
  { value: "mutation", label: "Mutation" },
  { value: "untyped", label: "Untyped" },
];

export function buildHeatmapFilterConfigs(endpoints: EndpointNodeData[]): FilterConfig[] {
  return [
    {
      key: "source",
      label: "Source",
      options: extractUniqueValues(endpoints, (ep) => ep.source),
      searchable: true,
    },
    {
      key: "group",
      label: "Group",
      options: extractUniqueValues(endpoints, (ep) => ep.group),
      searchable: true,
    },
    { key: "endpointType", label: "Type", options: TYPE_OPTIONS },
    {
      key: "httpMethod",
      label: "HTTP",
      options: extractUniqueValues(endpoints, (ep) => ep.httpMethod),
    },
  ];
}
