/**
 * The whole number a counter shows for an animated value on its way to a
 * count. Rounding a value just below zero gives `-0`, which a locale format
 * prints as "-0"; it shows as 0.
 *
 * @param latest - The animated value
 * @returns The number to show
 * @example
 * ```ts
 * displayedCount(19.6); // → 20
 * displayedCount(-0.3); // → 0, not -0
 * ```
 */
export function displayedCount(latest: number): number {
  return Math.round(latest) || 0;
}
