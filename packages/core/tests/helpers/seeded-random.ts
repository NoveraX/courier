/**
 * Numbers in [0, 1) drawn from a seed — mulberry32 — so a test that draws
 * random cases draws the same ones on every run, and the seed of a failing
 * run reproduces it.
 *
 * @param seed - Any 32-bit integer
 * @returns The next number each call
 * @example
 * ```ts
 * const random = seededRandom(0x5eed);
 * random(); // the same first number on every run
 * ```
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Whole numbers drawn from a seed, each from 0 up to the `below` it is
 * asked for: the 32 bits `seededRandom` draws, taken modulo `below`.
 * mulberry32 mixes every bit of its state into each number, so a `below` of
 * 2 or 4 comes out as even as any other.
 *
 * @param seed - Picks the sequence
 * @returns A function giving the next number below its `below`
 * @example
 * ```ts
 * const next = seededIntegers(7);
 * next(6); // → a whole number from 0 to 5
 * ```
 */
export function seededIntegers(seed: number): (below: number) => number {
  const random = seededRandom(seed);
  return (below) => (random() * 4_294_967_296) % below;
}
