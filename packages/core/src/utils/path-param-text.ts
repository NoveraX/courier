import { encodePathValue } from "./encode-path-value";
import { routeChangingPart } from "./path-template";
import { simpleTexts } from "./simple-style";

/**
 * A path parameter's value as the path sends it, by one rule for every call
 * that fills one — an HTTP call's, a stream's, a channel's: in OpenAPI's
 * style for a path, `simple`, so a list is its items and an object each
 * field's name and value, with commas between them and each encoded on its
 * own, so a comma in one is no separator; for `{+name}`, each with its
 * slashes. A value JSON writes as `null` or leaves out — `NaN`, a date that
 * is no date — has no text to send, and is refused, as one that would change
 * the route is: empty, `.` or `..`, whole or as a part between slashes.
 *
 * @param name - The parameter's name
 * @param value - Its value, neither `undefined` nor `null`
 * @param keepsSlashes - Whether the parameter is written `{+name}`
 * @param refuse - What a refusal is thrown as
 * @returns The value as the path sends it
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for what JSON would lose: a file, a `Set`, a `Map`, a `BigInt`
 * @example
 * ```ts
 * pathParamText("ids", [3, "4,5"], false, (message) => new Error(message)); // → "3,4%2C5"
 * ```
 */
export function pathParamText(
  name: string,
  value: unknown,
  keepsSlashes: boolean,
  refuse: (message: string) => Error,
): string {
  const texts = simpleTexts(name, value);
  if (texts === undefined) {
    throw refuse(`Path parameter ${name} has no text to send: JSON writes it as null`);
  }
  const text = texts.join(",");
  const part = routeChangingPart(text, keepsSlashes);
  if (part !== undefined) {
    const which = part === text ? "it" : `its part "${part}"`;
    throw refuse(`Path parameter ${name} cannot be "${text}": ${which} would change the route`);
  }
  return texts.map((item) => encodePathValue(item, keepsSlashes)).join(",");
}
