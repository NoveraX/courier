/** URL search params shape for /waterfall */
export interface WaterfallSearchParams {
  sortBy?: string;
  groupBy?: string;
  mode?: string;
  search?: string;
  selected?: string;
}

export function validateWaterfallSearch(raw: Record<string, unknown>): WaterfallSearchParams {
  return {
    sortBy: parseString(raw.sortBy),
    groupBy: parseString(raw.groupBy),
    mode: parseString(raw.mode),
    search: parseString(raw.search),
    selected: parseString(raw.selected),
  };
}

function parseString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
