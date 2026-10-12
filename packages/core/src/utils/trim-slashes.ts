/**
 * Slashes trimmed from the ends of an address or a path, in time linear in
 * its length: a pattern such as `/\/+$/` is tried again at every slash of a
 * run that does not end the text, so a long run takes quadratic time.
 */

const SLASH = 0x2f;

/**
 * The text without the slashes it ends with.
 *
 * @param text - An address or a path
 * @returns It, its trailing slashes dropped
 * @example
 * ```ts
 * withoutTrailingSlashes("https://api.example.com/v1//"); // "https://api.example.com/v1"
 * ```
 */
export function withoutTrailingSlashes(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === SLASH) end--;
  return end === text.length ? text : text.slice(0, end);
}

/**
 * The text without the slashes it starts and ends with.
 *
 * @param text - A path or a part of one
 * @returns It, its leading and trailing slashes dropped
 * @example
 * ```ts
 * withoutEdgeSlashes("/orders/"); // "orders"
 * ```
 */
export function withoutEdgeSlashes(text: string): string {
  let start = 0;
  while (start < text.length && text.charCodeAt(start) === SLASH) start++;
  return withoutTrailingSlashes(start === 0 ? text : text.slice(start));
}
