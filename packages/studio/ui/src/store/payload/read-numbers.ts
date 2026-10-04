import { isPlainObject } from "@/socket/is-plain-object";

/**
 * A socket event's record holding a finite number under each of `keys` — a
 * timing breakdown, say — or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @param keys - The keys each to hold a number
 * @returns The numbers by key, or `undefined` when one is missing
 * @example
 * ```ts
 * readNumbers({ total: 5, fetch: 4 }, ["total", "fetch"] as const); // → { total: 5, fetch: 4 }
 * ```
 */
export function readNumbers<TKey extends string>(
  value: unknown,
  keys: readonly TKey[],
): Record<TKey, number> | undefined {
  if (!isPlainObject(value)) return undefined;
  const numbers: Partial<Record<TKey, number>> = {};
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== "number" || !Number.isFinite(field)) return undefined;
    numbers[key] = field;
  }
  return hasEvery(numbers, keys) ? numbers : undefined;
}

function hasEvery<TKey extends string>(
  numbers: Partial<Record<TKey, number>>,
  keys: readonly TKey[],
): numbers is Record<TKey, number> {
  return keys.every((key) => numbers[key] !== undefined);
}
