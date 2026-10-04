/** How a duration reads against the slow threshold. */
export type DurationTone = "normal" | "warn" | "err";

/**
 * How a duration reads: slow from the threshold Studio's settings set,
 * very slow from twice it.
 *
 * @param ms - The duration
 * @param slowMs - The slow threshold
 * @returns The tone
 * @example
 * ```ts
 * durationTone(620, 500); // "warn"
 * ```
 */
export function durationTone(ms: number, slowMs: number): DurationTone {
  if (ms >= slowMs * 2) return "err";
  return ms >= slowMs ? "warn" : "normal";
}
