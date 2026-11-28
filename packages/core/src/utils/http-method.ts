/**
 * HTTP's verbs as the core names them, and whether one reads: what an
 * endpoint's definition reads of the verb that addresses it, and a call
 * of the verb it sends. Apart from the rest of a call's helpers, so that a
 * page of definitions alone loads none of those.
 */

/**
 * Normalize HTTP method for external use.
 * Core uses `del` internally (reserved word), but APIs expect `DELETE`.
 *
 * @example normalizeHttpMethod("del") // → "DELETE"
 * @example normalizeHttpMethod("get") // → "GET"
 */
export function normalizeHttpMethod(method: string): string {
  const upper = method.toUpperCase();
  return upper === "DEL" ? "DELETE" : upper;
}

/**
 * Convert standard HTTP method to core's internal method name.
 * Inverse of `normalizeHttpMethod`.
 *
 * @example toInternalMethod("DELETE") // → "del"
 * @example toInternalMethod("GET") // → "get"
 */
export function toInternalMethod(method: string): string {
  const lower = method.toLowerCase();
  return lower === "delete" ? "del" : lower;
}

const READING_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "QUERY"]);

/**
 * Whether a verb only reads what it addresses, so a call made with it may be
 * sent again and its answer kept: GET, HEAD, OPTIONS, and QUERY, which asks
 * its question in a body.
 *
 * @param method - The verb, as HTTP spells it or as the client does (`"del"`)
 * @returns Whether it reads
 * @example
 * ```ts
 * isReadingMethod("query"); // → true
 * isReadingMethod("POST"); // → false
 * ```
 */
export function isReadingMethod(method: string): boolean {
  return READING_METHODS.has(normalizeHttpMethod(method));
}
