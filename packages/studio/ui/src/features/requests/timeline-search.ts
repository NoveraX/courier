import type {
  FilterDimension,
  FilterSelection,
  TimelineFilter,
  TimelineView,
} from "./timeline-filter";
import { FILTER_DIMENSIONS, NO_SELECTION, TIMELINE_VIEWS } from "./timeline-filter";

/** What the Timeline's address says it shows. */
export interface TimelineSearch {
  view?: TimelineView | undefined;
  q?: string | undefined;
  status?: string | undefined;
  method?: string | undefined;
  transport?: string | undefined;
  source?: string | undefined;
  group?: string | undefined;
  mode?: string | undefined;
  type?: string | undefined;
}

/* A request without a group is chosen in the address as this. */
const NO_GROUP = "-";

function isView(value: unknown): value is TimelineView {
  return TIMELINE_VIEWS.some((view) => view === value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Read the Timeline's address, keeping what it understands: a known view,
 * the search, and each filter's values as a comma-separated list.
 *
 * @param raw - The address's search parameters
 * @returns The Timeline's parameters
 * @example
 * ```ts
 * validateTimelineSearch({ view: "errors", status: "error,validation_error" });
 * ```
 */
export function validateTimelineSearch(raw: Record<string, unknown>): TimelineSearch {
  const search: TimelineSearch = {};
  if (isView(raw.view) && raw.view !== "all") search.view = raw.view;
  const q = text(raw.q);
  if (q) search.q = q;
  for (const dimension of FILTER_DIMENSIONS) {
    const values = text(raw[dimension]);
    if (values) search[dimension] = values;
  }
  return search;
}

function split(values: string | undefined, dimension: FilterDimension): string[] {
  const list = (values ?? "").split(",").filter((v) => v !== "");
  return dimension === "group" ? list.map((v) => (v === NO_GROUP ? "" : v)) : list;
}

/**
 * What the Timeline shows, as its address says.
 *
 * @param search - The Timeline's parameters
 * @returns The filter
 * @example
 * ```ts
 * filterFromSearch({ view: "slow", method: "GET,POST" }).selected.method; // ["GET", "POST"]
 * ```
 */
export function filterFromSearch(search: TimelineSearch): TimelineFilter {
  const selected: Record<FilterDimension, readonly string[]> = { ...NO_SELECTION };
  for (const dimension of FILTER_DIMENSIONS)
    selected[dimension] = split(search[dimension], dimension);
  return { view: search.view ?? "all", search: search.q ?? "", selected };
}

/**
 * The address for what the Timeline shows, leaving out what is not chosen.
 *
 * @param filter - What it shows
 * @returns The Timeline's parameters
 * @example
 * ```ts
 * searchFromFilter({ view: "all", search: "", selected: { ...NO_SELECTION, mode: ["proxy"] } }); // { mode: "proxy" }
 * ```
 */
export function searchFromFilter(filter: TimelineFilter): TimelineSearch {
  const search: TimelineSearch = {};
  if (filter.view !== "all") search.view = filter.view;
  if (filter.search) search.q = filter.search;
  const selected: FilterSelection = filter.selected;
  for (const dimension of FILTER_DIMENSIONS) {
    const values = selected[dimension].map((v) =>
      dimension === "group" && v === "" ? NO_GROUP : v,
    );
    if (values.length > 0) search[dimension] = values.join(",");
  }
  return search;
}
