import type { LabPoint } from "./lab-stats"

/** Where a chart draws: its size, and the room kept on each side for labels. */
export interface ChartBox {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

/** How a chart places a moment: time across, share up. */
export interface ChartScale {
  /** The time the chart spans, in ms. */
  span: number
  x: (ms: number) => number
  y: (share: number) => number
}

/**
 * The time a chart spans: the run's last moment, rounded up to a half
 * second under three seconds and to a second above, and never under one.
 *
 * @param lastMs - The run's last moment, in ms
 * @returns The span, in ms
 * @example
 * ```ts
 * chartSpan(1663) // 2000
 * ```
 */
export function chartSpan(lastMs: number): number {
  const unit = lastMs <= 3000 ? 500 : 1000
  return Math.max(1000, Math.ceil(lastMs / unit) * unit)
}

/* Room past the time a run should take: its answer comes a little after the pace's time. */
const HEADROOM = 1.25

/**
 * The time a chart spans as a run starts: the time the pace takes to read
 * the file, and a quarter more, so the answer that comes a little after it
 * still falls inside and the axis never moves when the run ends.
 *
 * @param expectedMs - How long the pace takes to read the file, in ms
 * @returns The span, in ms
 * @example
 * ```ts
 * startSpan(2000) // 2500
 * ```
 */
export function startSpan(expectedMs: number): number {
  return chartSpan(expectedMs * HEADROOM)
}

/**
 * The time a chart spans once a run has got to `neededMs`: the same span
 * while the run keeps clear of its right edge, a wider one — never a
 * narrower — once it comes near, as an upload slower than its pace does.
 *
 * @param span - The span so far, in ms
 * @param neededMs - The run's latest moment, in ms
 * @returns The span, in ms
 * @example
 * ```ts
 * grownSpan(2500, 1800) // 2500
 * grownSpan(2500, 2400) // 3000
 * ```
 */
export function grownSpan(span: number, neededMs: number): number {
  return neededMs > span * 0.92 ? Math.max(span, chartSpan(neededMs * HEADROOM)) : span
}

/**
 * Place a run's moments in a chart's box.
 *
 * @param box - The chart's size and margins
 * @param span - The time the chart spans, in ms
 * @returns The scale
 * @example
 * ```ts
 * chartScale({ width: 600, height: 240, left: 40, right: 12, top: 14, bottom: 26 }, 2000).x(1000) // 314
 * ```
 */
export function chartScale(box: ChartBox, span: number): ChartScale {
  const across = box.width - box.left - box.right
  const up = box.height - box.top - box.bottom
  return {
    span,
    x: (ms) => box.left + (Math.min(ms, span) / span) * across,
    y: (share) => box.top + (1 - share) * up,
  }
}

const TICK_STEPS = [500, 1000, 2000, 5000, 10_000]

/**
 * The times a chart's axis is marked at: every half second up to three
 * seconds, every second up to ten, every two above — and further apart
 * when the axis is too narrow to keep `minGap` px between its labels.
 *
 * @param span - The time the chart spans, in ms
 * @param across - The axis's length, in px
 * @param minGap - The least room between two labels, in px
 * @returns The marks, in ms
 * @example
 * ```ts
 * timeTicks(2000) // [0, 500, 1000, 1500, 2000]
 * timeTicks(2500, 250) // [0, 1000, 2000]
 * ```
 */
export function timeTicks(span: number, across = Number.POSITIVE_INFINITY, minGap = 56): number[] {
  const least = span <= 3000 ? 500 : span <= 10_000 ? 1000 : 2000
  const every =
    TICK_STEPS.find((step) => step >= least && (step / span) * across >= minGap) ??
    TICK_STEPS.at(-1) ??
    least
  return Array.from({ length: Math.floor(span / every) + 1 }, (_, at) => at * every)
}

/**
 * A bar that moves only when told, as steps: flat until each report, then
 * straight up to it, flat again to `endMs`.
 *
 * @param points - The reports, in order
 * @param endMs - Where the last step runs to
 * @param scale - The chart's scale
 * @returns The path's `d`, empty with no reports
 * @example
 * ```ts
 * stepPath([[100, 0.5]], 300, scale) // "M40 226H…"
 * ```
 */
export function stepPath(points: readonly LabPoint[], endMs: number, scale: ChartScale): string {
  if (points.length === 0) return ""
  let d = `M${scale.x(0)} ${scale.y(0)}`
  for (const [ms, share] of points) d += `H${scale.x(ms)}V${scale.y(share)}`
  const last = points.at(-1)?.[0] ?? 0
  return `${d}H${scale.x(Math.max(endMs, last))}`
}

/**
 * A bar that moves on its own, as a line through each of its moves.
 *
 * @param points - The moves, in order
 * @param scale - The chart's scale
 * @param closed - Whether to close the line down to 0, to fill under it
 * @returns The path's `d`, empty with no moves
 * @example
 * ```ts
 * linePath([[100, 0], [130, 0.04]], scale, false) // "M…L…"
 * ```
 */
export function linePath(points: readonly LabPoint[], scale: ChartScale, closed: boolean): string {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return ""
  const line = points.map(([ms, share], at) => `${at ? "L" : "M"}${scale.x(ms)} ${scale.y(share)}`)
  if (!closed) return line.join("")
  return `${line.join("")}V${scale.y(0)}H${scale.x(first[0])}Z`
}
