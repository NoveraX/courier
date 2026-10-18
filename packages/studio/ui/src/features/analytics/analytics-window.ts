import { sentOwnRequest } from "@/features/requests/own-requests";
import { isStreamRequest } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import type { AnalyticsRange } from "./analytics-search";

/** How far back each range reaches, ms. */
const REACH: Readonly<Record<AnalyticsRange, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  session: Number.POSITIVE_INFINITY,
};

/* The shortest stretch a chart spans, so a burst does not read as a rate. */
const MIN_SPAN = 60_000;

/** The finished calls Analytics reads, and the stretch of time its charts span. */
export interface AnalyticsWindow {
  /** HTTP calls that began within the range and have finished, oldest first. */
  done: RequestEntry[];
  /**
   * The ones of them that sent a request of their own, oldest first: what
   * every figure about the network counts. A call another call's request
   * answered sent none.
   */
  sent: RequestEntry[];
  /** When the stretch begins: the oldest call, a minute before its end at the least. */
  start: number;
  /** How long the stretch is, ms; it ends now. */
  span: number;
}

/**
 * The calls a range holds — streams left out, since a stream's length is
 * not a response time — and the stretch from the oldest of them to now.
 *
 * @param requests - The requests Studio holds, in any order
 * @param range - How far back to look
 * @param now - The time now
 * @returns The window
 * @example
 * ```ts
 * analyticsWindow(requests, "1m", Date.now()).done.length; // 42
 * ```
 */
export function analyticsWindow(
  requests: readonly RequestEntry[],
  range: AnalyticsRange,
  now: number,
): AnalyticsWindow {
  const reach = REACH[range];
  const done = requests
    .filter((r) => !isStreamRequest(r) && r.status !== "pending" && now - r.startedAt <= reach)
    .sort((a, b) => a.startedAt - b.startedAt);
  const oldest = done[0]?.startedAt ?? now;
  const span = Math.max(MIN_SPAN, now - oldest);
  return { done, sent: done.filter(sentOwnRequest), start: now - span, span };
}

/**
 * The window's requests in equal stretches of time, oldest first, each
 * read into a value. A request stamped after the window's end — begun
 * since `now` was taken — counts in the last stretch.
 *
 * @param win - The window
 * @param count - How many stretches
 * @param read - What a stretch's calls come to
 * @returns One value a stretch
 * @example
 * ```ts
 * stretchesOf(win, 12, (calls) => calls.length); // [3, 0, 5, …]
 * ```
 */
export function stretchesOf<TValue>(
  win: AnalyticsWindow,
  count: number,
  read: (calls: RequestEntry[]) => TValue,
): TValue[] {
  const stretches: RequestEntry[][] = Array.from({ length: count }, () => []);
  for (const r of win.sent) {
    const at = Math.floor(((r.startedAt - win.start) / win.span) * count);
    stretches[Math.min(count - 1, Math.max(0, at))]?.push(r);
  }
  return stretches.map(read);
}

/**
 * The window's requests in its two halves of time, for a figure's change
 * against the first half.
 *
 * @param win - The window
 * @returns The calls of the first half, and of the second
 * @example
 * ```ts
 * const [before, after] = halvesOf(win);
 * ```
 */
export function halvesOf(win: AnalyticsWindow): [RequestEntry[], RequestEntry[]] {
  const middle = win.start + win.span / 2;
  return [
    win.sent.filter((r) => r.startedAt < middle),
    win.sent.filter((r) => r.startedAt >= middle),
  ];
}
