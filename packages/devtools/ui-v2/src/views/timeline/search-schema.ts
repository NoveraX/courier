import type { TimelineFilters } from "@/store/types";
import type { RequestStatus } from "@/store/types";
import { EMPTY_FILTERS } from "@/store/constants";

/** URL search params shape for /timeline */
export interface TimelineSearchParams {
  search?: string;
  status?: string;
  mode?: string;
  type?: string;
  httpMethod?: string;
  source?: string;
  group?: string;
  minDuration?: number;
  selected?: string;
  tab?: string;
  filters?: boolean;
}

/** Parse raw URL search into typed params */
export function validateTimelineSearch(raw: Record<string, unknown>): TimelineSearchParams {
  return {
    search: parseString(raw.search),
    status: parseString(raw.status),
    mode: parseString(raw.mode),
    type: parseString(raw.type),
    httpMethod: parseString(raw.httpMethod),
    source: parseString(raw.source),
    group: parseString(raw.group),
    minDuration: parseNumber(raw.minDuration),
    selected: parseString(raw.selected),
    tab: parseString(raw.tab),
    filters: parseBoolean(raw.filters),
  };
}

/** Convert URL params → TimelineFilters */
export function searchToFilters(params: TimelineSearchParams): TimelineFilters {
  return {
    search: params.search ?? EMPTY_FILTERS.search,
    status: splitCsv(params.status) as RequestStatus[],
    mode: splitCsv(params.mode) as ("direct" | "proxy")[],
    type: splitCsv(params.type) as ("query" | "mutation")[],
    httpMethod: splitCsv(params.httpMethod),
    source: splitCsv(params.source),
    group: splitCsv(params.group),
    minDuration: params.minDuration ?? null,
  };
}

/** Convert TimelineFilters → URL search params (omits empty values) */
export function filtersToSearch(
  filters: TimelineFilters,
  extra: { selected?: string | null; tab?: string; showFilters?: boolean },
): TimelineSearchParams {
  const params: TimelineSearchParams = {};

  if (filters.search) params.search = filters.search;
  if (filters.status.length > 0) params.status = filters.status.join(",");
  if (filters.mode.length > 0) params.mode = filters.mode.join(",");
  if (filters.type.length > 0) params.type = filters.type.join(",");
  if (filters.httpMethod.length > 0) params.httpMethod = filters.httpMethod.join(",");
  if (filters.source.length > 0) params.source = filters.source.join(",");
  if (filters.group.length > 0) params.group = filters.group.join(",");
  if (filters.minDuration !== null) params.minDuration = filters.minDuration;
  if (extra.selected) params.selected = extra.selected;
  if (extra.tab && extra.tab !== "general") params.tab = extra.tab;
  if (extra.showFilters) params.filters = true;

  return params;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function parseString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseBoolean(v: unknown): boolean | undefined {
  if (v === true || v === "true" || v === "1") return true;
  return undefined;
}
