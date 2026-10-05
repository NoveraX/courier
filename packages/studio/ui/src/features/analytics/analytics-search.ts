/** How far back Analytics looks: the last minute, the last five, or the whole session. */
export const ANALYTICS_RANGES = ["1m", "5m", "session"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** What the endpoints table sorts by. */
export const ENDPOINT_SORTS = [
  "endpoint",
  "calls",
  "avg",
  "p50",
  "p95",
  "p99",
  "size",
  "errorRate",
] as const;
export type EndpointSort = (typeof ENDPOINT_SORTS)[number];

/** Which way a sort runs. */
export type SortDirection = "asc" | "desc";

/** Analytics' own part of its address: each left out while it is the default. */
export interface AnalyticsSearch {
  range?: AnalyticsRange | undefined;
  sort?: EndpointSort | undefined;
  dir?: SortDirection | undefined;
}

/** What Analytics shows, the defaults filled in. */
export interface AnalyticsView {
  range: AnalyticsRange;
  sort: EndpointSort;
  dir: SortDirection;
}

function oneOf<TValue extends string>(values: readonly TValue[], raw: unknown): TValue | undefined {
  return values.find((value) => value === raw);
}

/**
 * Which way a column sorts first: names A to Z, figures largest first.
 *
 * @param sort - The column
 * @returns Its first direction
 * @example
 * ```ts
 * firstDirection("endpoint"); // "asc"
 * ```
 */
export function firstDirection(sort: EndpointSort): SortDirection {
  return sort === "endpoint" ? "asc" : "desc";
}

/**
 * Read Analytics' parameters from its address, keeping only what differs
 * from the defaults: the whole session, the slowest p95 first.
 *
 * @param raw - The address's parameters
 * @returns Analytics' parameters
 * @example
 * ```ts
 * validateAnalyticsSearch({ range: "1m", sort: "p95", dir: "desc" }); // { range: "1m" }
 * ```
 */
export function validateAnalyticsSearch(raw: Record<string, unknown>): AnalyticsSearch {
  const search: AnalyticsSearch = {};
  const range = oneOf(ANALYTICS_RANGES, raw.range);
  if (range && range !== "session") search.range = range;
  const sort = oneOf(ENDPOINT_SORTS, raw.sort) ?? "p95";
  if (sort !== "p95") search.sort = sort;
  const dir = oneOf(["asc", "desc"] as const, raw.dir);
  if (dir && dir !== firstDirection(sort)) search.dir = dir;
  return search;
}

/**
 * What Analytics shows from its address, the defaults filled in.
 *
 * @param search - Analytics' parameters
 * @returns The view
 * @example
 * ```ts
 * analyticsView({ sort: "endpoint" }); // { range: "session", sort: "endpoint", dir: "asc" }
 * ```
 */
export function analyticsView(search: AnalyticsSearch): AnalyticsView {
  const sort = search.sort ?? "p95";
  return { range: search.range ?? "session", sort, dir: search.dir ?? firstDirection(sort) };
}

/**
 * The address's parameters for a view, the defaults left out.
 *
 * @param view - The view
 * @returns The parameters
 * @example
 * ```ts
 * analyticsSearch({ range: "5m", sort: "p95", dir: "desc" }); // { range: "5m" }
 * ```
 */
export function analyticsSearch(view: AnalyticsView): AnalyticsSearch {
  return validateAnalyticsSearch({ range: view.range, sort: view.sort, dir: view.dir });
}

/**
 * The sort a click on a column's head asks for: the same column turned
 * around, or another column in its first direction.
 *
 * @param view - What Analytics shows
 * @param sort - The column clicked
 * @returns The view sorted so
 * @example
 * ```ts
 * sortedBy({ range: "session", sort: "p95", dir: "desc" }, "p95").dir; // "asc"
 * ```
 */
export function sortedBy(view: AnalyticsView, sort: EndpointSort): AnalyticsView {
  if (view.sort === sort) return { ...view, dir: view.dir === "asc" ? "desc" : "asc" };
  return { ...view, sort, dir: firstDirection(sort) };
}
