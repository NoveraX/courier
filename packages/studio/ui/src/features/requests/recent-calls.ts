import type { RequestEntry } from "@/store/types";
import type { RequestState } from "./request-state";
import { isStreamRequest, requestStateOf } from "./request-state";

/** One of an endpoint's recent calls. */
export interface RecentCall {
  request: RequestEntry;
  state: RequestState;
  /** Its duration against the longest of them, 0–1; a stream fills its bar. */
  share: number;
}

/**
 * The newest of an endpoint's calls, each with its duration against the
 * longest of them.
 *
 * @param requests - The endpoint's calls, newest first
 * @param count - How many to take
 * @returns The calls, newest first
 * @example
 * ```ts
 * recentCallsOf(endpoint.requests, 10)[0]?.state; // "success"
 * ```
 */
export function recentCallsOf(requests: readonly RequestEntry[], count: number): RecentCall[] {
  const recent = requests.slice(0, count);
  const longest = Math.max(1, ...recent.map((r) => r.timing?.total ?? 0));
  return recent.map((request) => ({
    request,
    state: requestStateOf(request),
    share: isStreamRequest(request) ? 1 : (request.timing?.total ?? 0) / longest,
  }));
}
