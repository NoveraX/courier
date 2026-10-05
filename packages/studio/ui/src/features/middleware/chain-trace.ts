import type { RequestEntry } from "@/store/types-request";
import type { MiddlewarePhase } from "./middleware-phase";
import { phaseOf } from "./middleware-phase";

/** One middleware's run in a traced call. */
export interface TraceStep {
  name: string;
  phase: MiddlewarePhase;
  duration: number;
  /** Its time before `next()`, and after it returned, ms. */
  before: number;
  after: number;
  failed: boolean;
  error: string | undefined;
  headersAdded: string[];
}

/** A stretch of a lane, as shares of the call's time, 0–1. */
export interface LaneSpan {
  start: number;
  width: number;
}

/** One lane of a call's trace: a middleware's runs before and after the fetch, or the fetch. */
export interface TraceLane {
  name: string;
  kind: "middleware" | "fetch";
  /** How deep in the chain it sits, 0 for the outermost. */
  depth: number;
  spans: LaneSpan[];
  duration: number;
}

/** A call traced through its middleware. */
export interface ChainTrace {
  steps: TraceStep[];
  lanes: TraceLane[];
  /** The span the lanes are drawn against, ms. */
  span: number;
  /** Whether the call got as far as its fetch — a middleware may stop it before. */
  reachedFetch: boolean;
}

function stepOf(entry: RequestEntry["middlewareEntries"][number]): TraceStep {
  const phase = phaseOf(entry);
  const duration = entry.duration ?? 0;
  const measured = entry.beforeDuration !== undefined || entry.afterDuration !== undefined;
  const before = measured ? (entry.beforeDuration ?? 0) : phase === "after" ? 0 : duration;
  const after = measured ? (entry.afterDuration ?? 0) : phase === "after" ? duration : 0;
  return {
    name: entry.name,
    phase,
    duration,
    before,
    after,
    failed: entry.status === "error",
    error: entry.error,
    headersAdded: entry.headersAdded ?? [],
  };
}

/**
 * A call traced through its middleware, as an onion: each middleware's
 * time before `next()` in chain order, the fetch, then each one's time
 * after it in reverse — lanes drawn against the call's whole time — and
 * the steps in chain order. A call a middleware stopped before it fetched
 * has no fetch: it had no URL to fetch and spent no time fetching.
 *
 * @param r - The call
 * @returns The trace
 * @example
 * ```ts
 * traceOf(request).lanes.map((l) => l.name); // ["auth", "retry", "fetch"]
 * ```
 */
export function traceOf(r: RequestEntry): ChainTrace {
  const steps = [...r.middlewareEntries].sort((a, b) => a.index - b.index).map(stepOf);
  const fetch = r.timing?.fetch ?? 0;
  const before = steps.reduce((sum, s) => sum + s.before, 0);
  const after = steps.reduce((sum, s) => sum + s.after, 0);
  const span = Math.max(1, r.timing?.total ?? 0, before + fetch + after);
  let t = 0;
  const opening = steps.map((s) => {
    const start = t;
    t += s.before;
    return start;
  });
  const fetchStart = t;
  t += fetch;
  const closing = new Map<number, number>();
  for (let i = steps.length - 1; i >= 0; i--) {
    closing.set(i, t);
    t += steps[i]?.after ?? 0;
  }
  const lanes: TraceLane[] = steps.map((s, i) => ({
    name: s.name,
    kind: "middleware",
    depth: i,
    spans: [
      { start: (opening[i] ?? 0) / span, width: s.before / span },
      ...(s.after > 0 ? [{ start: (closing.get(i) ?? 0) / span, width: s.after / span }] : []),
    ],
    duration: s.duration,
  }));
  const reachedFetch = r.url !== undefined || fetch > 0;
  if (reachedFetch) {
    lanes.push({
      name: "fetch",
      kind: "fetch",
      depth: steps.length,
      spans: [{ start: fetchStart / span, width: fetch / span }],
      duration: fetch,
    });
  }
  return { steps, lanes, span, reachedFetch };
}
