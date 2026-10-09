/** How the Waterfall orders its requests. */
export const WATERFALL_SORTS = ["start", "duration", "size"] as const;
export type WaterfallSort = (typeof WATERFALL_SORTS)[number];

/** What the Waterfall groups its requests by. */
export const WATERFALL_GROUPS = ["none", "source", "group"] as const;
export type WaterfallGroup = (typeof WATERFALL_GROUPS)[number];

/** Which requests the Waterfall shows by how they were made. */
export const WATERFALL_MODES = ["all", "direct", "proxy", "webhook"] as const;
export type WaterfallMode = (typeof WATERFALL_MODES)[number];

/** The Waterfall's own part of its address: each left out while it is the default. */
export interface WaterfallSearch {
  q?: string | undefined;
  sort?: WaterfallSort | undefined;
  group?: WaterfallGroup | undefined;
  mode?: WaterfallMode | undefined;
}

/** What the Waterfall shows, the defaults filled in. */
export interface WaterfallView {
  q: string;
  sort: WaterfallSort;
  group: WaterfallGroup;
  mode: WaterfallMode;
}

function oneOf<TValue extends string>(values: readonly TValue[], raw: unknown): TValue | undefined {
  return values.find((value) => value === raw);
}

/**
 * Read the Waterfall's parameters from its address, keeping only what
 * differs from the defaults — start time, no grouping, every mode. The
 * search stays as typed: the field reads it back, so a space typed before
 * the next word must survive.
 *
 * @param raw - The address's parameters
 * @returns The Waterfall's parameters
 * @example
 * ```ts
 * validateWaterfallSearch({ sort: "duration", mode: "all", q: "users" }); // { sort: "duration", q: "users" }
 * ```
 */
export function validateWaterfallSearch(raw: Record<string, unknown>): WaterfallSearch {
  const search: WaterfallSearch = {};
  if (typeof raw.q === "string" && raw.q) search.q = raw.q;
  const sort = oneOf(WATERFALL_SORTS, raw.sort);
  if (sort && sort !== "start") search.sort = sort;
  const group = oneOf(WATERFALL_GROUPS, raw.group);
  if (group && group !== "none") search.group = group;
  const mode = oneOf(WATERFALL_MODES, raw.mode);
  if (mode && mode !== "all") search.mode = mode;
  return search;
}

/**
 * What the Waterfall shows from its address, the defaults filled in.
 *
 * @param search - The Waterfall's parameters
 * @returns The view
 * @example
 * ```ts
 * viewFromSearch({}); // { q: "", sort: "start", group: "none", mode: "all" }
 * ```
 */
export function viewFromSearch(search: WaterfallSearch): WaterfallView {
  return {
    q: search.q ?? "",
    sort: search.sort ?? "start",
    group: search.group ?? "none",
    mode: search.mode ?? "all",
  };
}

/**
 * The address's parameters for a view, the defaults left out.
 *
 * @param view - The view
 * @returns The Waterfall's parameters
 * @example
 * ```ts
 * searchFromView({ q: "", sort: "size", group: "none", mode: "proxy" }); // { sort: "size", mode: "proxy" }
 * ```
 */
export function searchFromView(view: WaterfallView): WaterfallSearch {
  return validateWaterfallSearch({ ...view });
}
