import type { RequestEntry } from "@/store/types";
import { percentile } from "./percentile";
import { isFailedState, isStreamRequest, requestStateOf } from "./request-state";

/** The requests that began in one second: the ones that went well, and the ones that failed. */
export interface ThroughputBar {
  ok: number;
  failed: number;
  /** How many seconds before now the second began. */
  secondsAgo: number;
}

/** What the last minute of traffic comes to. */
export interface LiveKpis {
  /** Requests that began in the last minute. */
  perMinute: number;
  /** The p95 of the ones of them that finished; `null` while none did. */
  p95: number | null;
  /** The share of the finished ones that failed, 0–1. */
  errorRate: number;
  /** Streams open now. */
  liveStreams: number;
}

const MINUTE = 60_000;

/**
 * The requests that began in each of the last seconds, oldest second first
 * — streams left out, since one lasts longer than a second.
 *
 * @param requests - The requests the Timeline holds
 * @param now - The time now
 * @param seconds - How many seconds back
 * @returns One bar a second
 * @example
 * ```ts
 * throughputBars(requests, Date.now()).at(-1); // the current second
 * ```
 */
export function throughputBars(
  requests: readonly RequestEntry[],
  now: number,
  seconds = 60,
): ThroughputBar[] {
  const bars = Array.from({ length: seconds }, (_, i) => ({
    ok: 0,
    failed: 0,
    secondsAgo: seconds - 1 - i,
  }));
  for (const r of requests) {
    if (isStreamRequest(r)) continue;
    const ago = Math.floor((now - r.startedAt) / 1000);
    const bar = bars[seconds - 1 - ago];
    if (ago < 0 || !bar) continue;
    if (isFailedState(requestStateOf(r))) bar.failed++;
    else bar.ok++;
  }
  return bars;
}

/**
 * The last minute of traffic: how many requests began, the p95 and error
 * rate of the ones that finished, and the streams open now.
 *
 * @param requests - The requests the Timeline holds
 * @param now - The time now
 * @returns The figures
 * @example
 * ```ts
 * liveKpis(requests, Date.now()).p95; // 153
 * ```
 */
export function liveKpis(requests: readonly RequestEntry[], now: number): LiveKpis {
  let perMinute = 0;
  let failed = 0;
  let liveStreams = 0;
  const durations: number[] = [];
  for (const r of requests) {
    const state = requestStateOf(r);
    if (isStreamRequest(r)) {
      if (state === "streaming") liveStreams++;
      continue;
    }
    if (now - r.startedAt >= MINUTE) continue;
    perMinute++;
    if (state === "pending" || state === "aborted" || r.timing === undefined) continue;
    durations.push(r.timing.total);
    if (isFailedState(state)) failed++;
  }
  const errorRate = durations.length > 0 ? failed / durations.length : 0;
  return { perMinute, p95: percentile(durations, 0.95), errorRate, liveStreams };
}

/**
 * How long calls to the same endpoint took: the p95 of the ones that
 * finished, and how many there were.
 *
 * @param requests - The requests the Timeline holds
 * @param r - The request whose endpoint it is
 * @returns The p95 and the count, or `null` when none finished
 * @example
 * ```ts
 * endpointLatency(requests, request); // { p95: 153, count: 12 }
 * ```
 */
export function endpointLatency(
  requests: readonly RequestEntry[],
  r: RequestEntry,
): { p95: number; count: number } | null {
  const durations: number[] = [];
  for (const other of requests) {
    if (other.source !== r.source || other.group !== r.group || other.method !== r.method) continue;
    if (isStreamRequest(other) || other.timing === undefined) continue;
    if (requestStateOf(other) === "aborted") continue;
    durations.push(other.timing.total);
  }
  const p95 = percentile(durations, 0.95);
  return p95 === null ? null : { p95, count: durations.length };
}
