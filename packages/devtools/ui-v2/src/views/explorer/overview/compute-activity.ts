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

export function computeActivityFeed(
  requests: RequestEntry[],
  limit = 50,
): ActivityEntry[] {
  return requests
    .filter((r) => r.status !== "pending")
    .slice(-limit)
    .reverse()
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
