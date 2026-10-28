/**
 * Give a record a key of its own, whatever the key. Assigning `record[key]`
 * with the key `__proto__` sets the record's prototype instead, and the key
 * is lost: a source of that name went missing from the routes built of the
 * config's sources.
 *
 * @param record - The record: an object literal, which no key but `__proto__` sets through a setter
 * @param key - The key, as the config spells it
 * @param value - Its value
 * @example
 * ```ts
 * const routes: Record<string, CourierRoutes> = {};
 * defineOwn(routes, "__proto__", legacyRoutes);
 * Object.keys(routes); // → ["__proto__"]
 * ```
 */
export function defineOwn<TValue>(
  record: Record<string, TValue>,
  key: string,
  value: TValue,
): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
