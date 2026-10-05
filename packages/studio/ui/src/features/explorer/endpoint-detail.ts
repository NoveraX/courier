import type { RequestState } from "@/features/requests/request-state";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import type { EndpointNode } from "./explorer-model";

/* How many of an endpoint's newest calls its latency chart and its list of calls show. */
const LATENCY_BARS = 24;
const RECENT_CALLS = 10;

/** One call on an endpoint's latency chart. */
export interface LatencyBar {
  request: RequestEntry;
  duration: number;
  /** Its duration against the longest shown, 0–1. */
  share: number;
  failed: boolean;
}

/** One of an endpoint's recent calls. */
export interface RecentCall {
  request: RequestEntry;
  state: RequestState;
  /** Its duration against the longest of them, 0–1; a stream fills its bar. */
  share: number;
}

/**
 * The latency chart of an endpoint: its newest finished HTTP calls, oldest
 * first, each against the longest of them.
 *
 * @param e - The endpoint
 * @returns The bars, left to right
 * @example
 * ```ts
 * latencyBars(endpoint).map((b) => b.duration); // [150, 91, 156, …]
 * ```
 */
export function latencyBars(e: EndpointNode): LatencyBar[] {
  const calls = e.requests
    .filter((r) => {
      const state = requestStateOf(r);
      return !isStreamRequest(r) && r.timing && state !== "pending" && state !== "aborted";
    })
    .slice(0, LATENCY_BARS)
    .reverse();
  const longest = Math.max(1, ...calls.map((r) => r.timing?.total ?? 0));
  return calls.map((request) => {
    const duration = request.timing?.total ?? 0;
    return {
      request,
      duration,
      share: duration / longest,
      failed: isFailedState(requestStateOf(request)),
    };
  });
}

/**
 * An endpoint's newest calls, each with its duration against the longest
 * of them.
 *
 * @param e - The endpoint
 * @returns The calls, newest first
 * @example
 * ```ts
 * recentCalls(endpoint)[0]?.state; // "success"
 * ```
 */
export function recentCalls(e: EndpointNode): RecentCall[] {
  const recent = e.requests.slice(0, RECENT_CALLS);
  const longest = Math.max(1, ...recent.map((r) => r.timing?.total ?? 0));
  return recent.map((request) => ({
    request,
    state: requestStateOf(request),
    share: isStreamRequest(request) ? 1 : (request.timing?.total ?? 0) / longest,
  }));
}
