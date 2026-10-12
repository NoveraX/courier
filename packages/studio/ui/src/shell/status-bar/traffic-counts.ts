import type { RequestEntry } from "@/store";

/** What the status bar counts among the requests captured. */
export interface TrafficCounts {
  errors: number;
  pending: number;
  streams: number;
  /** The bytes of the responses captured. */
  bytes: number;
}

/**
 * The requests that failed, the calls still in flight, the streams still
 * open and the bytes the responses brought, as the status bar and the
 * navigation drawer's status count them.
 *
 * @param requests - The requests captured
 * @returns The counts
 * @example
 * ```ts
 * countTraffic(useStudioStore.getState().requests); // { errors: 2, pending: 1, streams: 0, bytes: 2048 }
 * ```
 */
export function countTraffic(requests: readonly RequestEntry[]): TrafficCounts {
  const counts = { errors: 0, pending: 0, streams: 0, bytes: 0 };
  for (const r of requests) {
    if (r.status === "error") counts.errors++;
    if (r.status === "pending") counts.pending++;
    if (r.streamStatus === "streaming") counts.streams++;
    counts.bytes += r.size ?? 0;
  }
  return counts;
}
