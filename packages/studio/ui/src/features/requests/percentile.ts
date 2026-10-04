/**
 * A percentile of a set of numbers, by the nearest rank below.
 *
 * @param values - The numbers, in any order
 * @param fraction - The percentile as a fraction: `0.95` for p95
 * @returns The value, or `null` for no numbers
 * @example
 * ```ts
 * percentile([30, 10, 20], 0.95); // 30
 * ```
 */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
}
