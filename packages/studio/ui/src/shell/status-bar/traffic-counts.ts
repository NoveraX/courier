import { sentOwnRequest } from "@/features/requests/own-requests";
import { isFailedState, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store";

/** What the status bar counts among the calls captured. */
export interface TrafficCounts {
  calls: number;
  /** The requests those calls sent: a read another call's request answered sent none. */
  requests: number;
  /** The requests that failed — an error, or an answer its schema refused. */
  errors: number;
  /** The calls still in flight. */
  pending: number;
  streams: number;
  /** The bytes the requests' answers brought. */
  bytes: number;
}

/**
 * The calls captured and the requests they sent, the requests that
 * failed, the calls still in flight, the streams still open and the bytes
 * the answers brought, as the status bar and the navigation drawer's
 * status count them. A read another call's request answered holds that
 * request's answer: its failure and its bytes are that request's.
 *
 * @param requests - The requests captured
 * @returns The counts
 * @example
 * ```ts
 * countTraffic(useStudioStore.getState().requests); // { calls: 9, requests: 7, errors: 2, pending: 1, streams: 0, bytes: 2048 }
 * ```
 */
export function countTraffic(requests: readonly RequestEntry[]): TrafficCounts {
  const counts = { calls: 0, requests: 0, errors: 0, pending: 0, streams: 0, bytes: 0 };
  for (const r of requests) {
    counts.calls++;
    if (r.status === "pending") counts.pending++;
    if (r.streamStatus === "streaming") counts.streams++;
    if (!sentOwnRequest(r)) continue;
    counts.requests++;
    if (isFailedState(requestStateOf(r))) counts.errors++;
    counts.bytes += r.size ?? 0;
  }
  return counts;
}

/**
 * The status bar's count of what was captured: the requests, and the
 * calls beside them where some sent none of their own.
 *
 * @param counts - The traffic's counts
 * @returns `"5 req"`, or `"14 calls · 5 req"`
 * @example
 * ```ts
 * capturedText(countTraffic(requests)); // "14 calls · 5 req"
 * ```
 */
export function capturedText({ calls, requests }: TrafficCounts): string {
  return calls === requests ? `${requests} req` : `${calls} calls · ${requests} req`;
}
