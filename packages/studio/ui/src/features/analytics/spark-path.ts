/** A sparkline drawn in a 100 × 32 box: its line, the area under it, and where it ends. */
export interface SparkPath {
  line: string;
  area: string;
  /** How far down the box the line ends, 0–1. */
  end: number;
}

const WIDTH = 100;
const HEIGHT = 32;
/* The line keeps 3 units clear of the bottom and rises at most 25, so its end dot stays inside. */
const BASE = 29;
const RISE = 25;

/**
 * Values over time with the gaps filled: a stretch that has no value —
 * the success rate of a stretch without calls — takes the one before it,
 * and leading gaps the first value there is.
 *
 * @param values - The values, oldest first, `null` where a stretch has none
 * @returns The values with no gaps; zeros when none has a value
 * @example
 * ```ts
 * fillGaps([null, 90, null, 100]); // [90, 90, 90, 100]
 * ```
 */
export function fillGaps(values: readonly (number | null)[]): number[] {
  let last = values.find((v) => v !== null) ?? 0;
  return values.map((v) => {
    if (v !== null) last = v;
    return last;
  });
}

/**
 * A sparkline of values over time. A flat or nearly flat series sits near
 * the bottom rather than swinging across the box: the scale spans at least
 * 15% of the largest value.
 *
 * @param values - The values, oldest first
 * @returns The line, its area and where it ends
 * @example
 * ```ts
 * sparkPath([3, 5, 4]).line; // "M0.00 29.00 L50.00 4.00 L100.00 16.50"
 * ```
 */
export function sparkPath(values: readonly number[]): SparkPath {
  const top = Math.max(...values, 0.0001);
  const low = Math.min(...values, top);
  const scale = Math.max(top - low, top * 0.15, 0.0001);
  const last = values.length - 1;
  const points = values.map((value, i): [number, number] => [
    last > 0 ? (i / last) * WIDTH : WIDTH,
    BASE - ((value - low) / scale) * RISE,
  ]);
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  return {
    line,
    area: `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`,
    end: (points.at(-1)?.[1] ?? BASE) / HEIGHT,
  };
}
