import type { AnalyticsWindow } from "./analytics-window";
import { stretchesOf } from "./analytics-window";
import { isFailure } from "./call-stats";

/** One bar of requests over time: the calls that failed in its stretch, and the rest. */
export interface SeriesBar {
  ok: number;
  failed: number;
}

/** Requests over time, with the tallest bar's height. */
export interface RequestSeries {
  bars: SeriesBar[];
  /** The most calls any stretch holds; 1 at the least, so a height divides by it. */
  max: number;
}

/* How many bars span the window. */
const BARS = 30;

/**
 * The window's calls over time, in thirty equal stretches ending now, each
 * split into the calls that failed and the rest.
 *
 * @param win - The window
 * @returns The bars, oldest first, and the tallest
 * @example
 * ```ts
 * requestSeries(win).max; // 9
 * ```
 */
export function requestSeries(win: AnalyticsWindow): RequestSeries {
  const bars = stretchesOf(win, BARS, (calls) => {
    const failed = calls.filter(isFailure).length;
    return { ok: calls.length - failed, failed };
  });
  return { bars, max: Math.max(1, ...bars.map((bar) => bar.ok + bar.failed)) };
}
