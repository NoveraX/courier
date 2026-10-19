/**
 * A key as a JSON pointer writes it: `~` as `~0` and `/` as `~1`.
 *
 * @param key - The key
 * @returns The pointer's segment for it
 * @example
 * ```ts
 * pointerSegment("/pets/{id}"); // → "~1pets~1{id}"
 * ```
 */
export function pointerSegment(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
