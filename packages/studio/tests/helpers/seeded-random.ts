/**
 * A seeded source of random whole numbers, the same on every run, so a test
 * that draws its cases from one fails the same way each time.
 *
 * Each call returns a number from 0 up to `below`. The generator is
 * mulberry32: every bit of its 32-bit state is mixed into each number, so a
 * `below` of 2 or 4 comes out as even as any other.
 *
 * @param seed - Picks the sequence
 * @returns A function giving the next number below its `below`
 * @example
 * ```ts
 * const next = seededRandom(7);
 * next(6); // → a whole number from 0 to 5
 * ```
 */
export function seededRandom(seed: number): (below: number) => number {
  let state = seed >>> 0;
  return function next(below: number): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % below;
  };
}
