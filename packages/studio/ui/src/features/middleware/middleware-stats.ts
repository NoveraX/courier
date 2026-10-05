import { percentile } from "@/features/requests/percentile";
import type { MiddlewareEntry } from "@/store/types-events";
import type { RequestEntry } from "@/store/types-request";
import type { MiddlewarePhase } from "./middleware-phase";
import { phaseOf } from "./middleware-phase";

/** One middleware across the calls it ran in. */
export interface MiddlewareStat {
  name: string;
  /** Where it works in most of its runs. */
  phase: MiddlewarePhase;
  calls: number;
  /** Its time in a call, ms. */
  avg: number;
  p95: number;
  total: number;
  /** Runs that failed. */
  errors: number;
  /** The headers it added in any run. */
  headersAdded: string[];
  /** Its share of all middleware time, 0–1. */
  share: number;
}

/** What the middleware of a session comes to. */
export interface MiddlewareOverview {
  /** Calls that ran through middleware. */
  traced: number;
  /** The share of those calls' time spent in middleware, 0–100. */
  overhead: number;
  /** Middleware time in a call, on average, ms. */
  perCall: number;
  /** Each middleware, in the order it runs. */
  stats: MiddlewareStat[];
  /** Middleware runs that failed. */
  errors: number;
}

/**
 * The calls that ran through middleware and finished.
 *
 * @param requests - The requests Studio holds
 * @returns The calls, in the same order
 * @example
 * ```ts
 * traced(requests).length; // 412
 * ```
 */
export function traced(requests: readonly RequestEntry[]): RequestEntry[] {
  return requests.filter((r) => r.middlewareEntries.length > 0 && r.status !== "pending");
}

function mostCommon(phases: readonly MiddlewarePhase[]): MiddlewarePhase {
  const counts = new Map<MiddlewarePhase, number>();
  for (const phase of phases) counts.set(phase, (counts.get(phase) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "wrap";
}

function statOf(name: string, runs: readonly MiddlewareEntry[], all: number): MiddlewareStat {
  const durations = runs.map((run) => run.duration ?? 0);
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    name,
    phase: mostCommon(runs.map(phaseOf)),
    calls: runs.length,
    avg: total / Math.max(1, runs.length),
    p95: percentile(durations, 0.95) ?? 0,
    total,
    errors: runs.filter((run) => run.status === "error").length,
    headersAdded: [...new Set(runs.flatMap((run) => run.headersAdded ?? []))],
    share: all > 0 ? total / all : 0,
  };
}

/**
 * What the session's middleware comes to: the share of the traced calls'
 * time it took, its time in a call, each middleware in the order it runs
 * with its calls, times, failures and the headers it adds, and the
 * failures in all.
 *
 * @param calls - The calls that ran through middleware
 * @returns The overview
 * @example
 * ```ts
 * middlewareOverview(traced(requests)).overhead; // 6.4
 * ```
 */
export function middlewareOverview(calls: readonly RequestEntry[]): MiddlewareOverview {
  const runs = new Map<string, MiddlewareEntry[]>();
  const order = new Map<string, number>();
  for (const r of calls) {
    for (const entry of r.middlewareEntries) {
      const list = runs.get(entry.name);
      if (list) list.push(entry);
      else runs.set(entry.name, [entry]);
      order.set(entry.name, Math.min(order.get(entry.name) ?? entry.index, entry.index));
    }
  }
  const mwTime = calls.reduce((sum, r) => sum + (r.timing?.middleware ?? 0), 0);
  const allTime = calls.reduce((sum, r) => sum + (r.timing?.total ?? 0), 0);
  const runTime = [...runs.values()].flat().reduce((sum, run) => sum + (run.duration ?? 0), 0);
  const stats = [...runs]
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([name, list]) => statOf(name, list, runTime));
  return {
    traced: calls.length,
    overhead: allTime > 0 ? (mwTime / allTime) * 100 : 0,
    perCall: mwTime / Math.max(1, calls.length),
    stats,
    errors: stats.reduce((sum, s) => sum + s.errors, 0),
  };
}
