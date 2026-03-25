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
    const newAvg = r.avgLatency === 0
      ? duration
      : r.avgLatency + (duration - r.avgLatency) / newHits;
    return { ...r, hits: newHits, avgLatency: Math.round(newAvg) };
  });

  useMockStore.getState().setServerRoutes(serverId, routes);
}
