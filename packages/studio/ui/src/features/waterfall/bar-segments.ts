import { requestStateOf } from "@/features/requests/request-state";
import { timingPhasesOf } from "@/features/requests/timing-phases";
import type { RequestEntry } from "@/store/types";

/** A part of a request's bar: a leg of the proxy route, a phase, or the time it is still waiting. */
export type SegmentKey =
  | "client-to-proxy"
  | "middleware-in"
  | "middleware"
  | "fetch"
  | "validation"
  | "middleware-out"
  | "other"
  | "proxy-to-client"
  | "in-flight"
  | "aborted";

export interface BarSegment {
  key: SegmentKey;
  duration: number;
}

/** A request drawn on the Waterfall: how long it took in all, and its parts in order. */
export interface RequestBar {
  total: number;
  segments: BarSegment[];
}

const PHASE_SEGMENT: Readonly<Record<string, SegmentKey>> = {
  "middleware-in": "middleware-in",
  middleware: "middleware",
  fetch: "fetch",
  validation: "validation",
  "middleware-out": "middleware-out",
  overhead: "other",
};

/**
 * A request's bar on the Waterfall: for a proxied call the caller's leg to
 * the proxy and back around the phases Courier measured; for one still in
 * flight the time it has waited so far; for an aborted one the time it ran.
 *
 * @param r - The request
 * @param now - The time now, for a request still waiting
 * @returns Its total and its parts
 * @example
 * ```ts
 * barOf(request, Date.now()).segments.map((s) => s.key); // ["middleware-in", "fetch", "validation", "middleware-out"]
 * ```
 */
export function barOf(r: RequestEntry, now: number): RequestBar {
  const state = requestStateOf(r);
  if (state === "pending") {
    const waited = Math.max(1, now - r.startedAt);
    return { total: waited, segments: [{ key: "in-flight", duration: waited }] };
  }
  const phases = timingPhasesOf(r);
  if (state === "aborted" || !phases) {
    const ran = r.timing?.total ?? 0;
    const key: SegmentKey = state === "aborted" ? "aborted" : "other";
    return { total: ran, segments: ran > 0 ? [{ key, duration: ran }] : [] };
  }
  const segments: BarSegment[] = phases.phases.map((p) => ({
    key: PHASE_SEGMENT[p.key] ?? "other",
    duration: p.duration,
  }));
  const legs = r.mode === "proxy" ? r.proxyTiming : undefined;
  if (legs && legs.clientToProxy > 0)
    segments.unshift({ key: "client-to-proxy", duration: legs.clientToProxy });
  if (legs && legs.proxyToClient > 0)
    segments.push({ key: "proxy-to-client", duration: legs.proxyToClient });
  const kept = segments.filter((s) => s.duration > 0);
  return { total: kept.reduce((sum, s) => sum + s.duration, 0), segments: kept };
}
