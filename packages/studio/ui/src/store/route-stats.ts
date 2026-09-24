import type { MockRouteEntry } from "./mock-slice-types";

import { useMockStore } from "./mock-slice";

/** Update route hits + running average latency after a request completes */
export function updateRouteStats(
  serverId: string,
  group: string,
  endpoint: string,
  httpMethod: string,
  duration: number,
): void {
  const server = useMockStore.getState().servers[serverId];
  if (!server) return;

  const routes = server.routes.map((r) => {
    if (r.group !== group || r.endpoint !== endpoint || r.httpMethod !== httpMethod) return r;
    const newHits = r.hits + 1;
    /* A route announced without an average starts from none. */
    const previous = Number.isFinite(r.avgLatency) ? r.avgLatency : 0;
    const newAvg = previous === 0 ? duration : previous + (duration - previous) / newHits;
    return { ...r, hits: newHits, avgLatency: Math.round(newAvg) };
  });

  useMockStore.getState().setServerRoutes(serverId, routes);
}

/** Preserve client-side hits/avgLatency when incoming routes arrive with zeros */
export function mergeRouteStats(
  existing: MockRouteEntry[],
  incoming: MockRouteEntry[],
): MockRouteEntry[] {
  if (existing.length === 0) return incoming;

  const statsMap = new Map<string, { hits: number; avgLatency: number }>();
  for (const r of existing) {
    if (r.hits > 0) {
      statsMap.set(`${r.httpMethod}:${r.group}:${r.endpoint}`, {
        hits: r.hits,
        avgLatency: r.avgLatency,
      });
    }
  }

  if (statsMap.size === 0) return incoming;

  return incoming.map((r) => {
    const stats = statsMap.get(`${r.httpMethod}:${r.group}:${r.endpoint}`);
    if (!stats || r.hits > 0) return r;
    return { ...r, hits: stats.hits, avgLatency: stats.avgLatency };
  });
}

