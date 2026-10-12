/**
 * The fixture's randomness: one seed gives the same project every time, so
 * a run measured today and one measured next month build the same code.
 */

/**
 * A random number source from a seed: mulberry32, small and fast.
 *
 * @param {number} seed - The seed
 * @returns {() => number} A function giving numbers in [0, 1)
 * @example
 * ```js
 * const next = seeded(1);
 * next(); // the same number for seed 1, every run
 * ```
 */
export function seeded(seed) {
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
 * A whole number between two bounds, both included.
 *
 * @param {() => number} next - The random number source
 * @param {number} min - The least
 * @param {number} max - The most
 * @returns {number} The number
 * @example
 * ```js
 * between(next, 5, 8); // 5, 6, 7 or 8
 * ```
 */
export function between(next, min, max) {
  return min + Math.floor(next() * (max - min + 1));
}

/**
 * One item of a list.
 *
 * @template TItem
 * @param {() => number} next - The random number source
 * @param {readonly TItem[]} items - The list
 * @returns {TItem} The item
 * @example
 * ```js
 * pick(next, ["a", "b"]); // "a" or "b"
 * ```
 */
export function pick(next, items) {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error("pick: the list is empty");
  return item;
}

/**
 * Some items of a list, each at most once, in the list's order.
 *
 * @template TItem
 * @param {() => number} next - The random number source
 * @param {readonly TItem[]} items - The list
 * @param {number} count - How many
 * @returns {TItem[]} The items
 * @example
 * ```js
 * some(next, ["a", "b", "c"], 2); // ["a", "c"], say
 * ```
 */
export function some(next, items, count) {
  const chosen = new Set();
  while (chosen.size < Math.min(count, items.length)) chosen.add(Math.floor(next() * items.length));
  return [...chosen].sort((a, b) => a - b).map((index) => /** @type {TItem} */ (items[index]));
}
