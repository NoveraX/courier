import type { RequestEntry } from "@/store/types";
import type { FilterDimension, TimelineFilter, TimelineView } from "./timeline-filter";
import { dimensionValue, matchesFilter, TIMELINE_VIEWS } from "./timeline-filter";

/** A value a filter offers, and how many requests choosing it would show. */
export interface FilterOption {
  value: string;
  label: string;
  count: number;
  /** The colour swatch shown beside it, by name; none for most filters. */
  swatch?: string | undefined;
}

/** How each filter is named, and whether its values are code. */
export const DIMENSION_META: Readonly<Record<FilterDimension, { label: string; mono: boolean }>> = {
  status: { label: "Status", mono: false },
  method: { label: "Method", mono: true },
  transport: { label: "Transport", mono: false },
  source: { label: "Source", mono: true },
  group: { label: "Group", mono: true },
  mode: { label: "Mode", mono: false },
  type: { label: "Type", mono: false },
};

type Known = readonly (readonly [value: string, label: string, swatch?: string])[];

/* The values a filter always offers, in this order; Source and Group offer the ones seen. */
const KNOWN: Partial<Record<FilterDimension, Known>> = {
  status: [
    ["success", "Success", "ok"],
    ["error", "Error", "err"],
    ["validation_error", "Validation", "warn"],
    ["pending", "Pending", "warn"],
    ["aborted", "Aborted", "muted"],
    ["streaming", "Streaming", "brand"],
    ["closed", "Closed", "ok"],
  ],
  method: ["GET", "POST", "PUT", "PATCH", "DELETE", "QUERY"].map(
    (m) => [m, m, m.toLowerCase()] as const,
  ),
  transport: [
    ["http", "HTTP", "muted"],
    ["sse", "SSE", "brand"],
    ["ws", "WebSocket", "keyword"],
  ],
  mode: [
    ["direct", "Direct"],
    ["proxy", "Proxy"],
  ],
  type: [
    ["query", "Query"],
    ["mutation", "Mutation"],
  ],
};

/** What a request without a group is listed as in the Group filter. */
export const NO_GROUP_LABEL = "no group";

/**
 * The values a filter offers: the ones it always offers, then any other
 * the requests have — most requests first — each with how many requests
 * choosing it would show given everything else chosen.
 *
 * @param requests - The requests the Timeline holds
 * @param filter - What it shows now
 * @param dimension - The filter
 * @param slowMs - The slow threshold
 * @returns The options
 * @example
 * ```ts
 * filterOptions(requests, filter, "source", 500); // [{ value: "api", label: "api", count: 12 }]
 * ```
 */
export function filterOptions(
  requests: readonly RequestEntry[],
  filter: TimelineFilter,
  dimension: FilterDimension,
  slowMs: number,
): FilterOption[] {
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const r of requests) {
    const value = dimensionValue(r, dimension);
    seen.set(value, (seen.get(value) ?? 0) + 1);
    if (matchesFilter(r, filter, { slowMs, skip: dimension })) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const known = KNOWN[dimension] ?? [];
  const knownValues = new Set(known.map(([value]) => value));
  const others = [...seen.keys()]
    .filter((value) => !knownValues.has(value))
    .sort((a, b) => (seen.get(b) ?? 0) - (seen.get(a) ?? 0) || a.localeCompare(b));
  return [
    ...known.map(([value, label, swatch]) => ({
      value,
      label,
      swatch,
      count: counts.get(value) ?? 0,
    })),
    ...others.map((value) => ({
      value,
      label: value === "" ? NO_GROUP_LABEL : value,
      count: counts.get(value) ?? 0,
    })),
  ];
}

/**
 * How many requests each quick view would show, given every filter chosen.
 *
 * @param requests - The requests the Timeline holds
 * @param filter - What it shows now
 * @param slowMs - The slow threshold
 * @returns The count per view
 * @example
 * ```ts
 * viewCounts(requests, filter, 500).errors; // 3
 * ```
 */
export function viewCounts(
  requests: readonly RequestEntry[],
  filter: TimelineFilter,
  slowMs: number,
): Record<TimelineView, number> {
  const counts: Record<TimelineView, number> = { all: 0, errors: 0, slow: 0, pending: 0 };
  for (const view of TIMELINE_VIEWS) {
    const viewed = { ...filter, view };
    counts[view] = requests.filter((r) => matchesFilter(r, viewed, { slowMs })).length;
  }
  return counts;
}

/**
 * What a filter's button says of the values chosen: up to two by name,
 * else the first and how many more.
 *
 * @param options - The filter's options
 * @param chosen - The values chosen
 * @returns The summary
 * @example
 * ```ts
 * selectionSummary(options, ["GET", "POST", "PUT"]); // "GET +2"
 * ```
 */
export function selectionSummary(
  options: readonly FilterOption[],
  chosen: readonly string[],
): string {
  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const [first = ""] = chosen;
  if (chosen.length <= 2) return chosen.map(labelOf).join(", ");
  return `${labelOf(first)} +${chosen.length - 1}`;
}
