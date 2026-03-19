/** URL search params shape for /middleware */
export interface MiddlewareSearchParams {
  mode?: string;
  selectedRequestId?: string;
  sortBy?: string;
  sortDir?: string;
}

export function validateMiddlewareSearch(
  raw: Record<string, unknown>,
): MiddlewareSearchParams {
  return {
    mode: parseString(raw.mode),
    selectedRequestId: parseString(raw.selectedRequestId),
    sortBy: parseString(raw.sortBy),
    sortDir: parseString(raw.sortDir),
  };
}

function parseString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
