import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { percentile } from "@/features/requests/percentile";
import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import type { RequestEntry } from "@/store/types";
import type { EndpointSort, SortDirection } from "./analytics-search";
import { averageSize, durationsOf, isFailure } from "./call-stats";

/** One endpoint's row of the endpoints table. */
export interface EndpointRow {
  /** Its dotted name: `source.group.method`. */
  key: string;
  /** Its source and the dot after it, shown dimmed: `billing.` */
  prefix: string;
  /** Its name past the source: `invoices.list`. */
  name: string;
  httpMethod: string;
  calls: number;
  /** Response times, ms; `null` while every call was cut short. */
  avg: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  /** The average response, bytes. */
  size: number;
  failed: number;
  /** The share of its calls that failed, 0–100. */
  errorRate: number;
  /** Its calls, newest first. */
  requests: RequestEntry[];
}

function rowOf(key: string, newest: RequestEntry, calls: RequestEntry[]): EndpointRow {
  const durations = durationsOf(calls);
  const failed = calls.filter(isFailure).length;
  return {
    key,
    ...endpointParts(newest),
    httpMethod: httpMethodOf(newest),
    calls: calls.length,
    avg: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    size: averageSize(calls) ?? 0,
    failed,
    errorRate: (failed / calls.length) * 100,
    requests: calls,
  };
}

/**
 * The endpoints the calls reached, one row each with its call count,
 * response times, average size and failures.
 *
 * @param done - The finished calls, oldest first
 * @returns One row an endpoint, the most recently called first
 * @example
 * ```ts
 * endpointRows(win.done)[0]; // { key: "billing.invoices.list", calls: 9, p95: 2270, … }
 * ```
 */
export function endpointRows(done: readonly RequestEntry[]): EndpointRow[] {
  const byKey = new Map<string, RequestEntry[]>();
  for (let i = done.length - 1; i >= 0; i--) {
    const r = done[i];
    if (!r) continue;
    const key = endpointKeyOf(r);
    const calls = byKey.get(key);
    if (calls) calls.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey].flatMap(([key, calls]) => (calls[0] ? [rowOf(key, calls[0], calls)] : []));
}

/**
 * The rows sorted by a column — names alphabetically, figures by value —
 * a row without a figure, such as the p95 of calls all cut short, last.
 *
 * @param rows - The rows
 * @param sort - The column
 * @param dir - Which way
 * @returns The rows, sorted
 * @example
 * ```ts
 * sortEndpointRows(rows, "p95", "desc")[0]?.key; // the slowest endpoint
 * ```
 */
export function sortEndpointRows(
  rows: readonly EndpointRow[],
  sort: EndpointSort,
  dir: SortDirection,
): EndpointRow[] {
  const sign = dir === "asc" ? 1 : -1;
  if (sort === "endpoint") return [...rows].sort((a, b) => a.key.localeCompare(b.key) * sign);
  return [...rows].sort((a, b) => {
    const x = a[sort];
    const y = b[sort];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * sign;
  });
}
