import { setTimeout as sleep } from "node:timers/promises";

/**
 * One of the items, picked at random.
 *
 * @param items - The items; at least one
 * @returns The one picked
 * @example
 * ```ts
 * pick(["desk", "lamp"]);
 * ```
 */
export function pick<TItem>(items: readonly TItem[]): TItem {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("Nothing to pick from");
  return item;
}

/**
 * Up to `count` of the items, picked at random, each once.
 *
 * @param items - The items
 * @param count - How many to pick at most
 * @returns The ones picked
 * @example
 * ```ts
 * pickSome(products, 4);
 * ```
 */
export function pickSome<TItem>(items: readonly TItem[], count: number): TItem[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

/**
 * Whether something with the given probability happens this time.
 *
 * @param probability - From 0, never, to 1, always
 * @returns Whether it happens
 * @example
 * ```ts
 * if (chance(0.3)) await search();
 * ```
 */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Wait between `min` and `max` milliseconds, as a person does between clicks.
 *
 * @param min - The shortest wait, in ms
 * @param max - The longest wait, in ms
 * @returns When the wait is over
 * @example
 * ```ts
 * await pause(500, 1_500);
 * ```
 */
export function pause(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}
