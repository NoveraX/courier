import type { RequestEntry } from "@/store/types";
import { percentile } from "./kpi-helpers";
import type { EndpointSortKey, EndpointStat, SortDir } from "./types";

export function computeEndpointStats(requests: RequestEntry[]): EndpointStat[] {
  const map = new Map<string, RequestEntry[]>();

  for (const r of requests) {
    if (r.status === "pending") continue;
    const label = [r.source, r.group, r.method].filter(Boolean).join(".");
    const entries = map.get(label);
    if (entries) entries.push(r);
    else map.set(label, [r]);
  }

  return Array.from(map, ([endpoint, entries]) => {
    const durations = entries
      .flatMap((r) => (r.timing ? [r.timing.total] : []))
      .sort((a, b) => a - b);

    const errors = entries.filter(
      (r) => r.status === "error" || r.status === "validation_error",
    ).length;

    const totalSize = entries.reduce((s, r) => s + (r.size ?? 0), 0);
    const avgTime =
      durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

    return {
      endpoint,
      calls: entries.length,
      avgResponseTime: avgTime,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      avgSize: entries.length > 0 ? totalSize / entries.length : 0,
      errorRate: entries.length > 0 ? (errors / entries.length) * 100 : 0,
      lastStatus: entries.at(-1)?.status ?? "pending",
      requestIds: entries.map((r) => r.id),
    };
  }).sort((a, b) => b.p95 - a.p95);
}

export function sortEndpoints(
  stats: EndpointStat[],
  key: EndpointSortKey,
  dir: SortDir,
): EndpointStat[] {
  const mul = dir === "asc" ? 1 : -1;

  return [...stats].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === "string" && typeof vb === "string") {
      return mul * va.localeCompare(vb);
    }
    return mul * ((va as number) - (vb as number));
  });
}
