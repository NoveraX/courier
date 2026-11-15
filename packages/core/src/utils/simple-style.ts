import { isPlainRecord } from "./is-plain-record";
import { ADDRESS_HOLDS_TEXT, fieldText, jsonValueOf } from "./variables-encoding";

/**
 * A value as the texts OpenAPI's style for a path and a header, `simple`,
 * writes it in, a comma to go between each two: a list as its items, an
 * object as each field's name and value, any other value as its own text. Each is written
 * as JSON writes it inside the variables, its `toJSON` asked first, so a date
 * is its ISO time and a direct call writes what a page's call through the
 * proxy carries. An item or a field JSON leaves out or writes as `null` is
 * left out, as the query string leaves it out.
 *
 * @param name - The variable's name
 * @param value - Its value
 * @param binary - What to suggest for binary data found there
 * @returns The texts, or `undefined` for a value JSON writes as `null` or leaves out: `NaN`, a date that is no date
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for what JSON would lose: a file, a `Set`, a `Map`, a `BigInt`
 * @example
 * ```ts
 * simpleTexts("ids", [3, "4,5"]); // → ["3", "4,5"]
 * simpleTexts("filter", { role: "admin" }); // → ["role", "admin"]
 * ```
 */
export function simpleTexts(
  name: string,
  value: unknown,
  binary = ADDRESS_HOLDS_TEXT,
): string[] | undefined {
  const text = (item: unknown, place: string, key: string) =>
    fieldText(item, `variables.${name}${place}`, key, binary);
  /* Its toJSON says, as JSON asks it, whether a value is a list, an object or text. */
  const written = jsonValueOf(value, name);
  if (Array.isArray(written)) {
    return written.flatMap((item: unknown, index) => text(item, `[${index}]`, `${index}`) ?? []);
  }
  if (isPlainRecord(written)) {
    return Object.entries(written).flatMap(([field, inner]) => {
      const written = text(inner, `.${field}`, field);
      return written === undefined ? [] : [field, written];
    });
  }
  const own = text(written, "", name);
  return own === undefined ? undefined : [own];
}
