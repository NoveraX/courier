import { isPlainObject } from "../is-plain-object";
/** A value read from a request, or why it cannot be read. */
export type Checked<TValue> = { ok: true; value: TValue } | { ok: false; message: string };

/**
 * Reads an object that must carry exactly the given fields.
 *
 * `Reflect.ownKeys` sees every own key, so a `__proto__` key that
 * `JSON.parse` defines as an ordinary property is refused like any other
 * stray field instead of slipping past a check of the known ones.
 *
 * @param value - The value to read.
 * @param where - The value's path in the request, such as `mocks[1]`; empty for the body itself.
 * @param fields - The fields it must have.
 * @param optional - The fields it may have besides; no others are accepted.
 * @returns The object, typed for reading its fields, or a message naming the first problem.
 * @example
 * readFields(JSON.parse('{"port":1,"x":2}'), "mocks[0]", ["port"]);
 * // { ok: false, message: 'mocks[0] has an unknown field "x"' }
 */
export function readFields(
  value: unknown,
  where: string,
  fields: readonly string[],
  optional: readonly string[] = [],
): Checked<Readonly<Record<string, unknown>>> {
  const name = where === "" ? "the body" : where;
  if (!isPlainObject(value)) return { ok: false, message: `${name} must be a JSON object` };
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol" || !(fields.includes(key) || optional.includes(key))) {
      return { ok: false, message: `${name} has an unknown field "${String(key)}"` };
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      return { ok: false, message: `${where === "" ? field : `${where}.${field}`} is required` };
    }
  }
  return { ok: true, value };
}
