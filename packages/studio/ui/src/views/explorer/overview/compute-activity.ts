import type { RequestEntry } from "@/store/types";

// ── Activity feed ───────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  source: string;
  group: string;
  method: string;
  httpMethod: string;
  duration: number;
  status: string;
  timestamp: number;
}

/**
 * The latest finished requests, newest first, as the Overview's feed lists
 * them.
 *
 * @param requests - The captured requests, newest first as the store holds them
 * @param limit - How many to list
 * @returns The feed's entries, newest first
 * @example
 * ```ts
 * const feed = computeActivityFeed(useStudioStore.getState().requests);
 * ```
 */
export function computeActivityFeed(requests: RequestEntry[], limit = 50): ActivityEntry[] {
  return requests
    .filter((r) => r.status !== "pending")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      source: r.source,
      group: r.group ?? "",
      method: r.method,
      httpMethod: r.httpMethod ?? "GET",
      duration: r.timing?.total ?? 0,
      status: r.status,
      timestamp: r.startedAt,
    }));
}
