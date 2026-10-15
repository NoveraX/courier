import { isPlainObject } from "../is-plain-object";
import { gatherRequests } from "../mcp/request-views";
import type { CatalogEndpoint } from "./endpoint-catalog";
import { type StreamTally, streamTallies } from "./stream-tallies";

type RuntimeEvent = Record<string, unknown>;

/** How an endpoint's calls went, as an editor shows it beside a call. */
export interface EndpointStats {
  readonly source: string;
  readonly endpoint: string;
  /** What it does: a stream's or a channel's calls are its connections */
  readonly kind: CatalogEndpoint["kind"];
  /** Calls Studio kept, finished or not — for a stream or a channel, the connections opened */
  readonly calls: number;
  /** Calls that failed */
  readonly failed: number;
  /** Calls still waiting for their answer — for a stream or a channel, the connections still open */
  readonly pending: number;
  /** How many calls ended with each status, `"failed"` for one that got none */
  readonly statuses: Readonly<Record<string, number>>;
  /** Half the finished calls that sent a request of their own took no longer, in milliseconds */
  readonly p50?: number | undefined;
  /** Nineteen in twenty of them took no longer */
  readonly p95?: number | undefined;
  /** When the latest call started */
  readonly lastAt?: number | undefined;
  /** The latest failure, why, and the request Studio keeps it as — which its inspector opens */
  readonly lastFailure?:
    | {
        readonly at: number;
        readonly status?: number;
        readonly message: string;
        readonly request?: string;
      }
    | undefined;
}

interface Tally {
  calls: number;
  failed: number;
  pending: number;
  statuses: Record<string, number>;
  durations: number[];
  lastAt?: number;
  lastFailure?: EndpointStats["lastFailure"];
}

/**
 * How each endpoint's calls went, from the requests Studio keeps: every
 * endpoint the config defines, one never called with no calls; a stream's
 * or a channel's are its connections, open or ended. A webhook delivered
 * to the app is no endpoint's call, and is left out.
 *
 * @param events - The key events Studio's request log keeps: each request's and stream's start and end
 * @param catalog - The endpoints the running config defines
 * @returns One entry per endpoint, in the catalog's order
 * @example
 * ```ts
 * endpointStats(requestLog.keyEvents(), catalog).find((s) => s.endpoint === "orders.place")?.p95;
 * ```
 */
export function endpointStats(
  events: readonly RuntimeEvent[],
  catalog: readonly CatalogEndpoint[],
): EndpointStats[] {
  const tallies = new Map<string, Tally>();
  for (const [request, gathered] of gatherRequests(events)) {
    const { start } = gathered;
    if (start.mode === "webhook") continue;
    const key = `${String(start.source)}\u0000${idOf(start)}`;
    const tally = tallies.get(key) ?? {
      calls: 0,
      failed: 0,
      pending: 0,
      statuses: {},
      durations: [],
    };
    tallies.set(key, tally);
    count(tally, gathered, request, numberOf(start.timestamp));
  }
  const streams = streamTallies(events, (source, endpoint) => `${source}\u0000${endpoint}`);
  return catalog.map(({ source, endpoint, kind }) => {
    const key = `${source}\u0000${endpoint}`;
    if (kind === "stream" || kind === "channel") {
      return streamStatsOf(source, endpoint, kind, streams.get(key));
    }
    return { ...statsOf(source, endpoint, tallies.get(key)), kind };
  });
}

function streamStatsOf(
  source: string,
  endpoint: string,
  kind: "stream" | "channel",
  tally: StreamTally | undefined,
): EndpointStats {
  if (!tally) return { source, endpoint, kind, calls: 0, failed: 0, pending: 0, statuses: {} };
  return {
    source,
    endpoint,
    kind,
    calls: tally.opened,
    failed: tally.failed,
    pending: tally.open,
    statuses: {},
    lastAt: tally.lastAt,
    lastFailure: tally.lastFailure,
  };
}

function idOf(start: RuntimeEvent): string {
  const group = typeof start.group === "string" && start.group !== "" ? `${start.group}.` : "";
  return `${group}${String(start.method)}`;
}

function count(
  tally: Tally,
  { end, error }: { end?: RuntimeEvent | undefined; error?: RuntimeEvent | undefined },
  request: string,
  at = 0,
): void {
  tally.calls += 1;
  tally.lastAt = Math.max(tally.lastAt ?? 0, at);
  const settled = end ?? error;
  if (!settled) {
    tally.pending += 1;
    return;
  }
  const status =
    numberOf(settled.status) ??
    (isPlainObject(error?.error) ? numberOf(error.error.status) : undefined);
  const label = status === undefined ? "failed" : String(status);
  tally.statuses[label] = (tally.statuses[label] ?? 0) + 1;
  /* The API's time is the requests': a read answered by another call's request only waited for it. */
  const total = isPlainObject(settled.timing) ? numberOf(settled.timing.total) : undefined;
  if (total !== undefined && settled.shared === undefined) tally.durations.push(total);
  if (!error) return;
  tally.failed += 1;
  const message =
    isPlainObject(error.error) && typeof error.error.message === "string"
      ? error.error.message
      : "Failed";
  if (at >= (tally.lastFailure?.at ?? 0))
    tally.lastFailure = { at, ...(status !== undefined && { status }), message, request };
}

function statsOf(
  source: string,
  endpoint: string,
  tally: Tally | undefined,
): Omit<EndpointStats, "kind"> {
  if (!tally) return { source, endpoint, calls: 0, failed: 0, pending: 0, statuses: {} };
  const sorted = [...tally.durations].sort((a, b) => a - b);
  return {
    source,
    endpoint,
    calls: tally.calls,
    failed: tally.failed,
    pending: tally.pending,
    statuses: tally.statuses,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    lastAt: tally.lastAt,
    lastFailure: tally.lastFailure,
  };
}

function percentile(sorted: readonly number[], share: number): number | undefined {
  if (sorted.length === 0) return undefined;
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
