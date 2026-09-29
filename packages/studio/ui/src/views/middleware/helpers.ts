import type { RequestEntry } from "@/store/types";
import { SLOW_STEP_MS } from "./constants";
import type { AggregateMiddleware, ChainEntry, MiddlewareStep } from "./types";

// ── Aggregate stats ────────────────────────────────────────────────────────

export function computeAggregateStats(requests: RequestEntry[]): AggregateMiddleware[] {
  const map = new Map<string, { durations: number[]; errors: number }>();

  for (const req of requests) {
    for (const mw of req.middlewareEntries) {
      const entry = map.get(mw.name) ?? { durations: [], errors: 0 };
      entry.durations.push(mw.duration ?? 0);
      if (mw.status === "error") entry.errors++;
      map.set(mw.name, entry);
    }
  }

  return Array.from(map.entries())
    .map(([name, { durations, errors }]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const total = sorted.reduce((s, d) => s + d, 0);
      return {
        name,
        calls: sorted.length,
        avgDuration: sorted.length > 0 ? total / sorted.length : 0,
        maxDuration: sorted.at(-1) ?? 0,
        p95Duration: percentile(sorted, 95),
        errors,
        errorRate: sorted.length > 0 ? (errors / sorted.length) * 100 : 0,
        totalDuration: total,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

// ── Chain builder ──────────────────────────────────────────────────────────

export function buildChain(request: RequestEntry): ChainEntry {
  const sorted = [...request.middlewareEntries].sort((a, b) => a.index - b.index);

  const steps: MiddlewareStep[] = sorted.map((mw) => ({
    name: mw.name,
    index: mw.index,
    duration: mw.duration ?? 0,
    status: mw.status,
    phase: inferPhase(mw),
    error: mw.error,
    headersAdded: mw.headersAdded,
    beforeDuration: mw.beforeDuration,
    afterDuration: mw.afterDuration,
  }));

  const totalOverhead = request.timing?.middleware ?? 0;
  const totalTime = request.timing?.total ?? 1;
  const overheadPercent = totalTime > 0 ? (totalOverhead / totalTime) * 100 : 0;

  return {
    requestId: request.id,
    steps,
    totalOverhead,
    overheadPercent,
    reachedFetch: request.url !== undefined || (request.timing?.fetch ?? 0) > 0,
  };
}

// ── Overhead across all requests ───────────────────────────────────────────

export function computeOverheadStats(requests: RequestEntry[]): {
  avgOverheadPercent: number;
  avgFetchPercent: number;
  avgOtherPercent: number;
} {
  const withTiming = requests.filter((r) => r.timing && r.timing.total > 0);
  if (withTiming.length === 0) {
    return { avgOverheadPercent: 0, avgFetchPercent: 0, avgOtherPercent: 0 };
  }

  let sumMw = 0;
  let sumFetch = 0;
  let sumOther = 0;

  for (const r of withTiming) {
    const t = r.timing!;
    const mwPct = (t.middleware / t.total) * 100;
    const fetchPct = (t.fetch / t.total) * 100;
    sumMw += mwPct;
    sumFetch += fetchPct;
    sumOther += 100 - mwPct - fetchPct;
  }

  const n = withTiming.length;
  return {
    avgOverheadPercent: sumMw / n,
    avgFetchPercent: sumFetch / n,
    avgOtherPercent: sumOther / n,
  };
}

// ── Phase inference ────────────────────────────────────────────────────────

import type { MiddlewareEntry } from "@/store/types-events";

/** Determine phase from declared metadata or measured timing */
function inferPhase(mw: MiddlewareEntry): "request" | "response" | "wrap" {
  // Use declared phase if present
  if (mw.phase === "before") return "request";
  if (mw.phase === "after") return "response";
  if (mw.phase === "wrap") return "wrap";

  // Infer from measured before/after timing
  const before = mw.beforeDuration ?? 0;
  const after = mw.afterDuration ?? 0;
  if (before > 0 && after <= 0.01) return "request";
  if (after > 0 && before <= 0.01) return "response";
  return "wrap";
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function isSlowStep(duration: number): boolean {
  return duration >= SLOW_STEP_MS;
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

/** Requests that have at least one middleware entry */
export function filterWithMiddleware(requests: RequestEntry[]): RequestEntry[] {
  return requests.filter((r) => r.middlewareEntries.length > 0);
}
