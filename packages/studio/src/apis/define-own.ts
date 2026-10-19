/**
 * Give a record a key of its own, whatever the key. Assigning `record[key]`
 * with the key `__proto__` sets the record's prototype instead, and the key
 * is lost: a field a specification names so went missing from every record
 * of fields Studio read from it, though `required` still listed it.
 *
 * @param record - The record, such as a schema's properties by name: an
 *   object literal, or one with no prototype, which no key but `__proto__` sets through a setter
 * @param key - The key, as the specification spells it
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
  /* `__proto__` alone is a setter every object inherits: any other key, `constructor` too, assigned
     is a key of the record's own, and assigning costs a tenth of defining it. */
  if (key !== "__proto__") {
    record[key] = value;
    return;
  }
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
