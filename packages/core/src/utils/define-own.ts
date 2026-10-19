/**
 * Give a record a key of its own, whatever the key. Assigning `record[key]`
 * with the key `__proto__` sets the record's prototype instead, and the
 * key is lost: a variable, a field or a header of that name went missing
 * from the record built of them.
 *
 * @param record - The record, such as the variables a call sends
 * @param key - The key, as the caller or the wire spells it
 * @param value - Its value
 * @example
 * ```ts
 * const fields: Record<string, string> = {};
 * defineOwn(fields, "__proto__", "x");
 * Object.keys(fields); // → ["__proto__"]
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
