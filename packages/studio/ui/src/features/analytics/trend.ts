/** How a figure moved since the first half of the range. */
export interface Trend {
  /** `12%`, `new` for a figure that was nothing before, or `flat`. */
  label: string;
  direction: "up" | "down" | "flat";
  /** Whether the move is for the better; `null` while flat. */
  good: boolean | null;
}

/* A move smaller than this share reads as no move at all. */
const STEADY = 0.05;
const MOST = 999;

const FLAT: Trend = { label: "flat", direction: "flat", good: null };

/**
 * How a figure moved from the first half of the range to the second: by
 * what share, which way, and whether that is good — up is good unless
 * less is better, as it is for latency and errors. A figure either half
 * cannot have, such as the success rate of no calls, makes no trend.
 *
 * @param before - The figure in the first half, or `null` when it has none
 * @param after - The figure in the second half, or `null` when it has none
 * @param lowerIsBetter - Whether a fall is the good move
 * @returns The trend
 * @example
 * ```ts
 * trendOf(570, 520, true); // { label: "9%", direction: "down", good: true }
 * ```
 */
export function trendOf(before: number | null, after: number | null, lowerIsBetter = false): Trend {
  if (before === null || after === null) return FLAT;
  if (before === 0) {
    return after === 0 ? FLAT : { label: "new", direction: "up", good: !lowerIsBetter };
  }
  const change = (after - before) / before;
  if (Math.abs(change) < STEADY) return FLAT;
  const up = change > 0;
  return {
    label: `${Math.min(MOST, Math.abs(change * 100)).toFixed(0)}%`,
    direction: up ? "up" : "down",
    good: lowerIsBetter ? !up : up,
  };
}
