import { isRecord } from "./is-record";

/**
 * JSON with every object's keys sorted, so that equal values always read
 * the same, whichever order their fields were set or arrived in: what a
 * signature is computed over must not depend on how a peer serialized it.
 * A field set to `undefined` is left out, as `JSON.stringify` leaves it.
 *
 * @param value - A JSON value: strings, finite numbers, booleans, `null`, arrays and plain objects
 * @returns Its canonical JSON
 *
 * @example
 * ```ts
 * canonicalJson({ b: 1, a: [true, { d: null, c: "x" }] }); // '{"a":[true,{"c":"x","d":null}],"b":1}'
 * ```
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? "null";
  const fields = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${fields.join(",")}}`;
}
