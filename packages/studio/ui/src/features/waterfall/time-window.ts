/* A stretch with no request running longer than this is drawn narrow, as an idle gap. */
export const IDLE_GAP_MS = 450;

/* How much of each side of an idle stretch stays drawn to scale. */
const GAP_MARGIN_MS = 60;

/** A span of time a request ran over. */
export interface Span {
  start: number;
  end: number;
}

/** A stretch of the window no request ran over, drawn narrow. */
export interface IdleGap {
  from: number;
  to: number;
}

/** The time the Waterfall shows: from the first request in view to the last one's end. */
export interface TimeWindow {
  start: number;
  end: number;
  gaps: IdleGap[];
}

/** Where a time lands on the track, and back. */
export interface TrackScale {
  trackPx: number;
  gapPx: number;
  toPx(t: number): number;
  fromPx(px: number): { t: number; idle: boolean };
}

/**
 * The window the Waterfall shows its requests over: from the first start to
 * the last end, each stretch longer than {@link IDLE_GAP_MS} with nothing
 * running marked as an idle gap, so a burst after a pause is not squeezed
 * into a sliver.
 *
 * @param spans - When each request in view ran
 * @param now - The time now, for a window with nothing in it
 * @returns The window and its idle gaps
 * @example
 * ```ts
 * timeWindowOf([{ start: 0, end: 40 }, { start: 2_000, end: 2_030 }], Date.now()).gaps; // [{ from: 100, to: 1_940 }]
 * ```
 */
export function timeWindowOf(spans: readonly Span[], now: number): TimeWindow {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const [first] = sorted;
  if (!first) return { start: now - 10_000, end: now - 9_500, gaps: [] };
  const gaps: IdleGap[] = [];
  let maxEnd = first.start;
  for (const [i, span] of sorted.entries()) {
    if (i > 0 && span.start - maxEnd > IDLE_GAP_MS) {
      gaps.push({ from: maxEnd + GAP_MARGIN_MS, to: span.start - GAP_MARGIN_MS });
    }
    maxEnd = Math.max(maxEnd, span.end);
  }
  return { start: first.start, end: Math.max(maxEnd, first.start + 500) + 80, gaps };
}

/**
 * How time maps onto a track this wide: each idle gap a fixed narrow
 * width, the rest of the window to scale, with room left at the end for
 * the last bar's label.
 *
 * @param window - The window
 * @param trackPx - The track's width
 * @returns The mapping both ways
 * @example
 * ```ts
 * const scale = trackScaleOf(window, 960);
 * scale.toPx(window.start); // 0
 * ```
 */
export function trackScaleOf(window: TimeWindow, trackPx: number): TrackScale {
  const { start, end, gaps } = window;
  const gapPx = Math.round(Math.min(44, Math.max(18, trackPx * 0.035)));
  const idle = gaps.reduce((sum, g) => sum + (g.to - g.from), 0);
  const k = Math.max(
    0.0001,
    (trackPx - 90 - gapPx * gaps.length) / Math.max(1, end - start - idle),
  );
  const toPx = (t: number): number => {
    let x = 0;
    let cursor = start;
    for (const g of gaps) {
      if (t <= g.from) return x + (t - cursor) * k;
      x += (g.from - cursor) * k;
      if (t < g.to) return x + ((t - g.from) / (g.to - g.from)) * gapPx;
      x += gapPx;
      cursor = g.to;
    }
    return x + (t - cursor) * k;
  };
  const fromPx = (px: number): { t: number; idle: boolean } => {
    let x = 0;
    let cursor = start;
    for (const g of gaps) {
      const width = (g.from - cursor) * k;
      if (px <= x + width) return { t: cursor + (px - x) / k, idle: false };
      x += width;
      if (px <= x + gapPx) return { t: g.from + ((px - x) / gapPx) * (g.to - g.from), idle: true };
      x += gapPx;
      cursor = g.to;
    }
    return { t: cursor + (px - x) / k, idle: false };
  };
  return { trackPx, gapPx, toPx, fromPx };
}

/**
 * The zoom that draws a typical request legibly: its median duration about
 * 28 pixels wide across the time requests were actually running, between
 * 1× and 10×.
 *
 * @param spans - When each request in view ran
 * @param contentPx - The width the track has without scrolling
 * @returns The zoom
 * @example
 * ```ts
 * autoZoomOf([{ start: 0, end: 20 }, { start: 30, end: 60 }], 900); // 1
 * ```
 */
export function autoZoomOf(spans: readonly Span[], contentPx: number): number {
  const durations = spans.map((s) => s.end - s.start).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)] ?? 100;
  let busy = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const from = Math.max(span.start, last);
    if (span.end > from) busy += span.end - from;
    last = Math.max(last, span.end);
  }
  const busySpan = spans.length ? Math.max(500, busy * 1.35) : 1_000;
  const zoom = ((28 / Math.max(1, median)) * busySpan) / Math.max(200, contentPx - 90);
  return Math.min(10, Math.max(1, zoom));
}
