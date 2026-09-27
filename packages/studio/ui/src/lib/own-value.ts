/**
 * The value a record holds under a key of its own, never one it inherits:
 * a group or an endpoint named like `toString` or `constructor` is a key
 * like any other, not a way into `Object.prototype`.
 *
 * @param record - The record, such as endpoints or fingerprints by name
 * @param key - The key
 * @returns The value, or `undefined` when the record has no such key of its own
 * @example
 * ```ts
 * ownValue({}, "toString"); // undefined
 * ```
 */
export function ownValue<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
): TValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
