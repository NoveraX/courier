/** The shortest ceiling a retry waits under, and the longest. */
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 30_000;

/**
 * How long to wait before the next try of something Redis refused: a
 * random time below a ceiling that doubles with each failed try, from a
 * quarter of a second up to thirty — "full jitter" — so replicas refused
 * together do not try again together.
 *
 * @param attempt - How many tries have failed in a row, from 0
 * @param random - A source of numbers in [0, 1), for tests
 * @returns The wait in milliseconds
 * @example
 * ```ts
 * setTimeout(retry, retryDelay(failures++));
 * ```
 */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempt, 16));
  return Math.floor(random() * ceiling);
}
