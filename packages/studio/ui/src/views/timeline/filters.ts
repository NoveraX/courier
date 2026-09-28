import type { RequestEntry } from "@/store/types";
import type { TimelineFilters } from "@/store/types";

import { requestName } from "./request-name";

/** Apply all active filters + search to a request list */
export function filterRequests(
  requests: readonly RequestEntry[],
  filters: TimelineFilters,
): RequestEntry[] {
  return requests.filter((r) => matchesAllFilters(r, filters));
}

function matchesAllFilters(r: RequestEntry, f: TimelineFilters): boolean {
  if (f.search && !matchesSearch(r, f.search)) return false;
  if (f.status.length > 0 && !f.status.includes(r.status)) return false;
  if (f.mode.length > 0 && !f.mode.includes(r.mode)) return false;
  if (f.type.length > 0 && !f.type.includes(r.type ?? "query")) return false;
  if (f.httpMethod.length > 0 && !f.httpMethod.includes(r.httpMethod ?? "GET")) return false;
  if (f.source.length > 0 && !f.source.includes(r.source)) return false;
  if (f.group.length > 0 && !f.group.includes(r.group ?? "")) return false;
  if (f.minDuration !== null && (r.timing?.total ?? 0) < f.minDuration) return false;
  return true;
}

/** A request is found by the dotted name its row shows, or any part of it, and by its URL. */
function matchesSearch(r: RequestEntry, query: string): boolean {
  const q = query.toLowerCase();

  if (requestName(r).toLowerCase().includes(q)) return true;
  if (r.url?.toLowerCase().includes(q)) return true;

  // Match status code
  if (r.statusCode && String(r.statusCode).includes(q)) return true;

  return false;
}

/** Check if any filter is active */
export function hasActiveFilters(filters: TimelineFilters): boolean {
  return (
    filters.search !== "" ||
    filters.status.length > 0 ||
    filters.mode.length > 0 ||
    filters.type.length > 0 ||
    filters.httpMethod.length > 0 ||
    filters.source.length > 0 ||
    filters.group.length > 0 ||
    filters.minDuration !== null
  );
}

/** Count active filter dimensions (not counting search) */
export function countActiveFilters(filters: TimelineFilters): number {
  let count = 0;
  if (filters.status.length > 0) count++;
  if (filters.mode.length > 0) count++;
  if (filters.type.length > 0) count++;
  if (filters.httpMethod.length > 0) count++;
  if (filters.source.length > 0) count++;
  if (filters.group.length > 0) count++;
  if (filters.minDuration !== null) count++;
  return count;
}
