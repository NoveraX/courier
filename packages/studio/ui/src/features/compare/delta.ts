/** How a figure moved from A to B. */
export interface Delta {
  /** `+27%`, `−12%`, `same`, or `—` when A had nothing to compare with. */
  label: string;
  direction: "up" | "down" | "same";
  /** How the move reads: worse, better, or neither. */
  tone: "err" | "ok" | "muted";
}

/* A move smaller than this share reads as the same. */
const SAME_BELOW = 3;

/**
 * How a figure moved from A to B, as a share of A — worse when it grew,
 * for a figure where less is better, such as a duration or a size.
 *
 * @param a - The figure on the left
 * @param b - The figure on the right
 * @returns The move
 * @example
 * ```ts
 * deltaOf(236, 1830); // { label: "+675%", direction: "up", tone: "err" }
 * ```
 */
export function deltaOf(a: number, b: number): Delta {
  if (a === 0) return { label: b === 0 ? "same" : "—", direction: "same", tone: "muted" };
  const change = ((b - a) / a) * 100;
  if (Math.abs(change) < SAME_BELOW) return { label: "same", direction: "same", tone: "muted" };
  const up = change > 0;
  return {
    label: `${up ? "+" : "−"}${Math.abs(change).toFixed(0)}%`,
    direction: up ? "up" : "down",
    tone: up ? "err" : "ok",
  };
}
