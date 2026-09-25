/**
 * A duration as a person reads it: whole milliseconds under a second,
 * seconds to a tenth from there, so a short budget never reads as `0 s`.
 *
 * @param ms - The duration, in milliseconds
 * @returns The duration with its unit
 *
 * @example
 * ```ts
 * formatDuration(40); // → "40 ms"
 * formatDuration(20_000); // → "20 s"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${Math.round(ms / 100) / 10} s`;
}
