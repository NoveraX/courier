import { formatDuration } from "@/lib/formatters";
import type { TimeWindow, TrackScale } from "./time-window";

/* Tick spacings a scale picks from, in ms. */
const NICE_MS = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000] as const;

/** A labelled mark on the time scale. */
export interface TimeTick {
  x: number;
  label: string;
}

/** An idle gap on the scale: where it sits, how wide, and what it stands for. */
export interface GapMark {
  x: number;
  width: number;
  label: string;
  title: string;
}

/**
 * A time as an offset from the window's start: `+120ms`, `+3.95s`, `+18.3s`.
 *
 * @param t - The time
 * @param start - The window's start
 * @returns The offset
 * @example
 * ```ts
 * relativeTime(18_300, 0); // "+18.3s"
 * ```
 */
export function relativeTime(t: number, start: number): string {
  const d = t - start;
  if (d < 1_000) return `+${Math.round(d)}ms`;
  return `+${(d / 1_000).toFixed(d >= 10_000 ? 1 : 2)}s`;
}

/**
 * The scale's marks: the start of every stretch between idle gaps, then
 * evenly spaced ones at least 84 px apart, none crowding a gap or the end.
 *
 * @param window - The window
 * @param scale - How time maps onto the track
 * @returns The marks, left to right
 * @example
 * ```ts
 * timeTicksOf(window, scale)[0]?.label; // "+0ms"
 * ```
 */
export function timeTicksOf(window: TimeWindow, scale: TrackScale): TimeTick[] {
  const span = scale.toPx(window.end) - scale.toPx(window.start);
  const perMs = span / Math.max(1, window.end - window.start);
  const step = NICE_MS.find((n) => n * perMs >= 84) ?? 30_000;
  const ticks: TimeTick[] = [];
  let lastX = Number.NEGATIVE_INFINITY;
  const push = (t: number): void => {
    const x = scale.toPx(t);
    if (x - lastX < 70 || x >= scale.trackPx - 60) return;
    ticks.push({ x, label: relativeTime(t, window.start) });
    lastX = x;
  };
  let from = window.start;
  for (const g of [...window.gaps, { from: window.end, to: window.end }]) {
    push(from);
    const first = Math.ceil((from - window.start + 1) / step) * step + window.start;
    for (let t = first; t < g.from; t += step) push(t);
    from = g.to;
  }
  return ticks.filter((tick) =>
    window.gaps.every((g) => {
      const gx = scale.toPx(g.from);
      return tick.x <= gx - 56 || tick.x >= gx + scale.gapPx - 1;
    }),
  );
}

/**
 * The idle gaps as the scale draws them, each labelled with how long it
 * lasted when there is room for it.
 *
 * @param window - The window
 * @param scale - How time maps onto the track
 * @returns One mark per gap
 * @example
 * ```ts
 * gapMarksOf(window, scale)[0]?.title; // "3.95s idle · compressed"
 * ```
 */
export function gapMarksOf(window: TimeWindow, scale: TrackScale): GapMark[] {
  return window.gaps.map((g) => {
    const lasted = formatDuration(g.to - g.from + 120);
    return {
      x: scale.toPx(g.from),
      width: scale.gapPx,
      label: scale.gapPx >= 38 ? lasted : "⋯",
      title: `${lasted} idle · compressed`,
    };
  });
}
