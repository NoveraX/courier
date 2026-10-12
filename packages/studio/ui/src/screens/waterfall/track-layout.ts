import { STACKED_BELOW } from "@/design/breakpoints";

/** How a Waterfall row lays out its label and its track. */
export type TrackLayout = "columns" | "stacked";

/**
 * The classes that place a row's parts: the row itself, its track, a bar on
 * the track and a stream's message marks. Beside a column of labels a row
 * is one line — taller under a finger, so a tap lands on the row it means;
 * stacked, the label is a line of its own and the track the line under it.
 */
export const TRACK_LAYOUT = {
  columns: {
    row: "h-8 pointer-coarse:h-11",
    track: "",
    bar: "top-2.25 pointer-coarse:top-3.5",
    tick: "top-2.75 pointer-coarse:top-4",
  },
  stacked: {
    row: "h-11 flex-col",
    track: "h-4.75",
    bar: "top-0.5",
    tick: "top-1",
  },
} as const satisfies Record<TrackLayout, Record<"row" | "track" | "bar" | "tick", string>>;

/**
 * The label's width in a row: the column's, or as wide as the chart shows
 * when the label is a line over the bar — the row as a whole runs as wide
 * as the track, which scrolls under it.
 *
 * @param stacked - Whether the label is a line over the bar
 * @param labelPx - The column's width
 * @param visiblePx - The chart's width in view
 * @param trackPx - The track's width
 * @returns The label's width in pixels
 * @example
 * ```ts
 * labelWidthIn(false, 320, 1180, 2400); // 320
 * labelWidthIn(true, 0, 375, 1200); // 375
 * ```
 */
export function labelWidthIn(
  stacked: boolean,
  labelPx: number,
  visiblePx: number,
  trackPx: number,
): number {
  return stacked ? Math.min(visiblePx, trackPx) : labelPx;
}

/**
 * How wide the Waterfall's column of labels is at a chart's width: a third
 * of it, between 240 and 320 pixels — and none on a chart too narrow to
 * spare that, as on a phone, where each row names its request over its
 * bar and the bars take the whole width. A chart not measured yet keeps
 * the column.
 *
 * @param width - The chart's width in pixels, 0 while it is not measured
 * @returns The column's width in pixels
 * @example
 * ```ts
 * labelWidthOf(1180); // 320
 * labelWidthOf(800); // 256
 * labelWidthOf(375); // 0
 * ```
 */
export function labelWidthOf(width: number): number {
  if (width > 0 && width < STACKED_BELOW) return 0;
  return Math.round(Math.min(320, Math.max(240, width * 0.32)));
}
