import { endpointName } from "@/features/requests/request-parts";
import { requestStateOf } from "@/features/requests/request-state";
import type { TimeWindow } from "./time-window";
import type { RequestItem } from "./waterfall-rows";

/** The four figures over the Waterfall. */
export interface WaterfallInsights {
  windowMs: number;
  gaps: number;
  peak: number;
  inView: number;
  slowest: { total: number; name: string } | undefined;
  /** The share of a finished request's time spent fetching, on average; `undefined` with none finished. */
  fetchShare: number | undefined;
}

function peakOf(items: readonly RequestItem[]): number {
  const edges = items.flatMap((i) => [
    [i.request.startedAt, 1],
    [i.request.startedAt + i.bar.total, -1],
  ]);
  edges.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
  let running = 0;
  let peak = 0;
  for (const [, change] of edges) {
    running += change ?? 0;
    peak = Math.max(peak, running);
  }
  return peak;
}

/**
 * What the Waterfall's figures say of the requests in view: how long the
 * window lasts and how many idle gaps it compresses, how many requests ran
 * at once at most, the slowest one finished, and how much of a finished
 * call's time went on its fetch — a webhook delivered to the app makes none.
 *
 * @param items - The requests in view, with their bars
 * @param window - The window they are drawn over
 * @returns The figures
 * @example
 * ```ts
 * waterfallInsights(items, window).peak; // 4
 * ```
 */
export function waterfallInsights(
  items: readonly RequestItem[],
  window: TimeWindow,
): WaterfallInsights {
  const done = items.filter((i) => {
    const state = requestStateOf(i.request);
    return state !== "pending" && state !== "aborted" && i.bar.total > 0;
  });
  const slowest = done.reduce<RequestItem | undefined>(
    (top, i) => (!top || i.bar.total > top.bar.total ? i : top),
    undefined,
  );
  /* A webhook delivered to the app makes no fetch: its time would only thin out the calls' share. */
  const shares = done
    .filter((i) => i.request.mode !== "webhook")
    .map((i) => (i.bar.segments.find((s) => s.key === "fetch")?.duration ?? 0) / i.bar.total);
  return {
    windowMs: window.end - window.start,
    gaps: window.gaps.length,
    peak: peakOf(items),
    inView: items.length,
    slowest: slowest && { total: slowest.bar.total, name: endpointName(slowest.request) },
    fetchShare: shares.length ? shares.reduce((sum, s) => sum + s, 0) / shares.length : undefined,
  };
}
