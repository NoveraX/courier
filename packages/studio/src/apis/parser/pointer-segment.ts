/**
 * A key as a JSON pointer writes it in a URI's fragment, `#/…`: `~` as
 * `~0`, `/` as `~1`, and `%` as `%25`, since a reference's pointer is read
 * with its percent escapes decoded — written as it is, `share%` named no
 * key, and `a%20b` named `a b`.
 *
 * @param key - The key
 * @returns The pointer's segment for it
 * @example
 * ```ts
 * pointerSegment("/pets/{id}"); // → "~1pets~1{id}"
 * pointerSegment("share%"); // → "share%25"
 * ```
 */
export function pointerSegment(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1").replaceAll("%", "%25");
}
