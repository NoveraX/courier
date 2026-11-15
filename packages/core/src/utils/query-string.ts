/**
 * Variables written into the query string of a request to the upstream.
 *
 * Written the way OpenAPI does by default (`style: form, explode: true`): a
 * list repeats its key, `?tag=a&tag=b`, and an object spreads its fields into
 * keys of their own. Each value is written as JSON writes it inside the
 * variables, its `toJSON` asked first, so a direct call sends what a page's
 * call through the proxy does. `String(value)` sent a list as `a,b`, an
 * object as `[object Object]`, and a date in the local format of whichever
 * machine ran the call.
 */

import { isPlainRecord } from "./is-plain-record";
import { ADDRESS_HOLDS_TEXT, fieldText, jsonValueOf } from "./variables-encoding";

/**
 * Query entries for a set of variables.
 *
 * @param variables - Values to write; what JSON leaves out or writes as `null` — `undefined`, `NaN`, a date that is no date — is left out
 * @returns Key/value pairs in order, a key repeated for each list item
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a file, a `Set`, a `Map` or a `BigInt`, named by where it sits
 *
 * @example
 * ```ts
 * toQueryEntries({ tag: ["a", "b"], page: 2 }); // → [["tag","a"],["tag","b"],["page","2"]]
 * ```
 */
export function toQueryEntries(variables: Record<string, unknown>): [string, string][] {
  const entries: [string, string][] = [];
  for (const [key, field] of Object.entries(variables)) {
    const at = `variables.${key}`;
    /* Its toJSON says, as JSON asks it, whether a value is a list, an object or text. */
    const value = jsonValueOf(field, key);
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        pushText(entries, key, item, `${at}[${index}]`, String(index));
      }
    } else if (isPlainRecord(value)) {
      for (const [name, inner] of Object.entries(value)) {
        pushText(entries, name, inner, `${at}.${name}`, name);
      }
    } else {
      pushText(entries, key, value, at, key);
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

/* A value nested deeper than the form style reaches is sent as its JSON; one with no text is no entry. */
function pushText(
  entries: [string, string][],
  name: string,
  value: unknown,
  at: string,
  key: string,
): void {
  const text = fieldText(value, at, key, ADDRESS_HOLDS_TEXT);
  if (text !== undefined) entries.push([name, text]);
}
