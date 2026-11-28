/**
 * The text a parameter's value takes in the path: encoded whole, or — for
 * `{+name}` — part by part between its slashes, which are kept. Apart from
 * the reading of a path's parameters (`path-template.ts`), which only a call
 * runs: an endpoint's definition writes a closure's path with this alone.
 *
 * @param value - The value, as text
 * @param keepsSlashes - Whether the parameter is written `{+name}`
 * @returns The value as the path sends it
 * @example
 * ```ts
 * encodePathValue("a/b c", true); // → "a/b%20c"
 * encodePathValue("a/b c", false); // → "a%2Fb%20c"
 * ```
 */
export function encodePathValue(value: string, keepsSlashes: boolean): string {
  return keepsSlashes
    ? value.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
}
