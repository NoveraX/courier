/**
 * Variables written into the query string of a request to the upstream.
 *
 * Written the way OpenAPI does by default (`style: form, explode: true`): a
 * list repeats its key, `?tag=a&tag=b`, and an object spreads its fields into
 * keys of their own. `String(value)` sent a list as `a,b` and an object as
 * `[object Object]`, and a date in the local format of whichever machine ran
 * the call.
 */

import { ADDRESS_HOLDS_TEXT, assertJsonValue } from "./variables-encoding";

/**
 * Query entries for a set of variables.
 *
 * @param variables - Values to write; `undefined` and `null` are left out
 * @returns Key/value pairs in order, a key repeated for each list item
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a file, a `Set` or a `Map`, named by where it sits
 *
 * @example
 * ```ts
 * toQueryEntries({ tag: ["a", "b"], page: 2 }); // → [["tag","a"],["tag","b"],["page","2"]]
 * ```
 */
export function toQueryEntries(variables: Record<string, unknown>): [string, string][] {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(variables)) {
    const at = `variables.${key}`;
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries())
        pushScalar(entries, key, item, `${at}[${index}]`);
    } else if (isPlainObject(value)) {
      for (const [field, inner] of Object.entries(value)) {
        pushScalar(entries, field, inner, `${at}.${field}`);
      }
    } else {
      pushScalar(entries, key, value, at);
    }
  }
  return entries;
}

/**
 * Append variables to a URL as its query string.
 *
 * @param url - The URL, with or without a query of its own
 * @param variables - Values to append
 * @returns The URL with the variables appended
 */
export function appendQuery(url: string, variables: Record<string, unknown>): string {
  /* `%20`, not the `+` URLSearchParams writes: outside a form submission a
     server may take `+` literally. */
  const query = toQueryEntries(variables)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function pushScalar(entries: [string, string][], key: string, value: unknown, at: string): void {
  if (value === undefined || value === null) return;
  entries.push([key, scalarText(value, at)]);
}

/**
 * A value nested deeper than the form style reaches is sent as JSON: one
 * JSON would lose — a file, a `Set`, a `Map` — is refused, with where it sits.
 */
function scalarText(value: unknown, at: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  assertJsonValue(value, at, ADDRESS_HOLDS_TEXT);
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || value instanceof Date) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
