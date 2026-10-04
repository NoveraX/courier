import type { RequestEntry } from "@/store/types";
import { codeLabel, endpointName, httpMethodOf } from "./request-parts";
import type { RequestState } from "./request-state";
import { isFailedState, isStreamRequest, requestStateOf, STATE_META } from "./request-state";

/** The Timeline's quick views: everything, the failures, the slow, the unfinished. */
export const TIMELINE_VIEWS = ["all", "errors", "slow", "pending"] as const;
export type TimelineView = (typeof TIMELINE_VIEWS)[number];

/** What the Timeline's filters choose by. */
export const FILTER_DIMENSIONS = [
  "status",
  "method",
  "transport",
  "source",
  "group",
  "mode",
  "type",
] as const;
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

/** The values chosen in each filter; none chosen lets every value through. */
export type FilterSelection = Readonly<Record<FilterDimension, readonly string[]>>;

/** What the Timeline shows of the requests. */
export interface TimelineFilter {
  view: TimelineView;
  search: string;
  selected: FilterSelection;
}

/** A selection with no value chosen in any filter. */
export const NO_SELECTION: FilterSelection = {
  status: [],
  method: [],
  transport: [],
  source: [],
  group: [],
  mode: [],
  type: [],
};

/** The Timeline before anything is chosen. */
export const OPEN_FILTER: TimelineFilter = { view: "all", search: "", selected: NO_SELECTION };

/** What matching needs beyond the filter: the slow threshold, and a part to leave out. */
export interface MatchOptions {
  slowMs: number;
  /** A filter, or the view, left out — to count what choosing in it would show. */
  skip?: FilterDimension | "view" | undefined;
}

/**
 * The value a request has in a filter: its state for Status, `http` for a
 * request that does not stream, `query` for one that does not say.
 *
 * @param r - The request
 * @param dimension - The filter
 * @returns The value
 * @example
 * ```ts
 * dimensionValue(request, "transport"); // "sse"
 * ```
 */
export function dimensionValue(r: RequestEntry, dimension: FilterDimension): string {
  switch (dimension) {
    case "status":
      return requestStateOf(r);
    case "method":
      return httpMethodOf(r);
    case "transport":
      return r.transport ?? "http";
    case "source":
      return r.source;
    case "group":
      return r.group ?? "";
    case "mode":
      return r.mode;
    case "type":
      return r.type ?? "query";
  }
}

function inView(r: RequestEntry, state: RequestState, view: TimelineView, slowMs: number): boolean {
  if (view === "errors") return isFailedState(state);
  if (view === "pending") return state === "pending" || state === "streaming";
  if (view === "slow") {
    return !isStreamRequest(r) && state !== "pending" && (r.timing?.total ?? 0) >= slowMs;
  }
  return true;
}

function matchesSearch(r: RequestEntry, state: RequestState, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    endpointName(r),
    r.url ?? "",
    codeLabel(r, state),
    httpMethodOf(r),
    STATE_META[state].label,
    r.transport ?? "http",
  ];
  return haystack.join(" ").toLowerCase().includes(query);
}

/**
 * Whether the Timeline shows a request: it is in the view, has a chosen
 * value in every filter where one is chosen, and holds the search.
 *
 * @param r - The request
 * @param filter - What the Timeline shows
 * @param options - The slow threshold, and a part to leave out
 * @returns Whether it shows
 * @example
 * ```ts
 * matchesFilter(request, { ...OPEN_FILTER, view: "errors" }, { slowMs: 500 });
 * ```
 */
export function matchesFilter(
  r: RequestEntry,
  filter: TimelineFilter,
  options: MatchOptions,
): boolean {
  const state = requestStateOf(r);
  if (options.skip !== "view" && !inView(r, state, filter.view, options.slowMs)) return false;
  for (const dimension of FILTER_DIMENSIONS) {
    const chosen = filter.selected[dimension];
    if (dimension === options.skip || chosen.length === 0) continue;
    if (!chosen.includes(dimensionValue(r, dimension))) return false;
  }
  return matchesSearch(r, state, filter.search);
}

/**
 * How many filters narrow the Timeline: the view when it is not All, and
 * each value chosen.
 *
 * @param filter - What the Timeline shows
 * @returns The count
 * @example
 * ```ts
 * activeFilterCount({ ...OPEN_FILTER, view: "slow" }); // 1
 * ```
 */
export function activeFilterCount(filter: TimelineFilter): number {
  const chosen = FILTER_DIMENSIONS.reduce((sum, d) => sum + filter.selected[d].length, 0);
  return (filter.view === "all" ? 0 : 1) + chosen;
}
