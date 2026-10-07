/* RFC 6265's cookie-name: a token, any character but controls, spaces and separators. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Tells whether a cookie is one of a list of names and prefixes. */
export type CookieMatcher = (name: string) => boolean;

/**
 * A matcher for a list of cookie names, where a name ending in `*` stands
 * for every cookie whose name begins with what comes before it. Names are
 * matched exactly: cookie names are case-sensitive.
 *
 * @param patterns - The names and prefixes
 * @returns Whether a cookie's name is one of them
 * @example
 * ```ts
 * const isSession = cookieMatcher(["sid", "logto_*"]);
 * isSession("logto_app1"); // true
 * isSession("SID"); // false
 * ```
 */
export function cookieMatcher(patterns: readonly string[]): CookieMatcher {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("*")) prefixes.push(pattern.slice(0, -1));
    else exact.add(pattern);
  }
  return (name) => exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
}

/**
 * Why a value cannot name a cookie, or a prefix of cookie names where one is
 * allowed: it must be a cookie-name token, and a prefix one ending in `*`
 * after at least one character of its own.
 *
 * @param value - The name or prefix, as written
 * @param allowPrefix - Whether a trailing `*` may make it a prefix
 * @returns The problem, or `undefined` for a good one
 * @example
 * ```ts
 * cookieNameProblem("logto_*", true); // undefined
 * cookieNameProblem("*", true); // "a prefix needs at least one character before the *"
 * ```
 */
export function cookieNameProblem(value: unknown, allowPrefix: boolean): string | undefined {
  if (typeof value !== "string" || value === "") return "a cookie name is a non-empty string";
  const isPrefix = allowPrefix && value.endsWith("*");
  const name = isPrefix ? value.slice(0, -1) : value;
  if (isPrefix && name === "") return "a prefix needs at least one character before the *";
  if (TOKEN.test(name) && !name.includes("*")) return undefined;
  const prefix = allowPrefix ? ", and a trailing * for a prefix" : "";
  return `"${value}" is not a cookie name: letters, digits and !#$%&'+-.^_\`|~ only${prefix}`;
}
