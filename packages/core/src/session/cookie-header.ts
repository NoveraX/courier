/** One cookie as a `Cookie` header carries it: its name and its value, as sent. */
export interface CookiePair {
  name: string;
  value: string;
}

/**
 * The cookies a `Cookie` header carries, in order. A pair with no `=` or an
 * empty name is passed over; a value is kept as it was sent, undecoded, so
 * it reaches an API exactly as the browser wrote it.
 *
 * @param header - The header, or nothing
 * @returns The pairs
 * @example
 * ```ts
 * parseCookieHeader("sid=a1; theme=dark; x"); // [{ name: "sid", value: "a1" }, { name: "theme", value: "dark" }]
 * ```
 */
export function parseCookieHeader(header: string | null | undefined): CookiePair[] {
  if (!header) return [];
  const pairs: CookiePair[] = [];
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    const name = part.slice(0, at).trim();
    if (name !== "") pairs.push({ name, value: part.slice(at + 1).trim() });
  }
  return pairs;
}

/**
 * The cookies of a request by name, the first of a name winning — the one a
 * browser lists first is the one most specific to the page — as most
 * servers read them.
 *
 * @param header - The request's `Cookie` header
 * @returns Each cookie's value by its name
 * @example
 * ```ts
 * cookieJarOf("a=1; a=2").get("a"); // "1"
 * ```
 */
export function cookieJarOf(header: string | null | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  for (const { name, value } of parseCookieHeader(header)) {
    if (!jar.has(name)) jar.set(name, value);
  }
  return jar;
}

/**
 * A `Cookie` header carrying the given cookies.
 *
 * @param pairs - The cookies, in the order to send them
 * @returns The header's value; `""` for none
 * @example
 * ```ts
 * cookieHeaderOf([{ name: "sid", value: "a1" }]); // "sid=a1"
 * ```
 */
export function cookieHeaderOf(pairs: Iterable<CookiePair>): string {
  const parts: string[] = [];
  for (const { name, value } of pairs) parts.push(`${name}=${value}`);
  return parts.join("; ");
}
