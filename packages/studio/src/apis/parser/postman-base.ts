/**
 * Where a Postman collection's requests are sent.
 *
 * A request names its host literally, as `https://api.example.com`, or through
 * a variable, as `{{baseUrl}}`, whose value the collection may carry. A
 * variable often holds a whole base URL, path included.
 */

import type { SpecNode } from "./types";

/** `{{name}}` anywhere in a text. */
const VARIABLE = /\{\{([^{}]+)\}\}/g;

/** A URL that says its own scheme. */
const ABSOLUTE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

/** The scheme and host a raw URL starts with; Postman reads the first segment as the host. */
const RAW_HOST = /^(?:([a-zA-Z][a-zA-Z\d+.-]*):\/\/)?([^/?#]*)/;

/**
 * The values a collection gives its variables.
 *
 * @param collection - The collection
 * @returns Each enabled variable's value, by name
 * @example
 * ```ts
 * collectionVariables({ variable: [{ key: "baseUrl", value: "https://api.example.com" }] });
 * // → Map { "baseUrl" => "https://api.example.com" }
 * ```
 */
export function collectionVariables(collection: SpecNode): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const entry of Array.isArray(collection.variable) ? collection.variable : []) {
    if (entry?.disabled === true) continue;
    if (typeof entry?.key === "string" && typeof entry.value === "string") {
      values.set(entry.key, entry.value);
    }
  }
  return values;
}

/**
 * The base URL a request is sent to: its scheme and host, with any variable
 * among them filled from the collection.
 *
 * @param url - The request's URL, structured or raw
 * @param variables - The collection's variables
 * @returns The base without a trailing slash, or `undefined` when the request
 *   names no host, or one only an environment would fill
 * @example
 * ```ts
 * requestBase("{{baseUrl}}/users", new Map([["baseUrl", "https://api.example.com/v1/"]]));
 * // → "https://api.example.com/v1"
 * ```
 */
export function requestBase(
  url: unknown,
  variables: ReadonlyMap<string, string>,
): string | undefined {
  const { scheme, host } = hostOf(url);
  const filled = host ? fill(host, variables) : undefined;
  if (!filled) return undefined;
  const base = ABSOLUTE.test(filled) ? filled : `${scheme ?? "https"}://${filled}`;
  return base.replace(/\/+$/, "");
}

/**
 * A raw URL without its scheme and host.
 *
 * Postman reads the first segment of a raw URL as its host, whether it is
 * written out or named by a variable, so `{{baseUrl}}/users/:id` addresses
 * `/users/:id` on whatever `{{baseUrl}}` holds.
 *
 * @param raw - A raw URL
 * @returns What follows the host: the path, and the query if there is one
 * @example
 * ```ts
 * withoutHost("{{baseUrl}}/users/:id"); // → "/users/:id"
 * withoutHost("https://api.example.com/v1?x=1"); // → "/v1?x=1"
 * ```
 */
export function withoutHost(raw: string): string {
  return raw.replace(RAW_HOST, "");
}

/**
 * The base URL most requests share; the first of those tied.
 *
 * @param bases - Each request's base, `undefined` where it has none
 * @returns The shared base, or `undefined` when no request has one
 * @example
 * ```ts
 * commonBase(["https://a.example", undefined, "https://b.example", "https://b.example"]);
 * // → "https://b.example"
 * ```
 */
export function commonBase(bases: readonly (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const base of bases) {
    if (base !== undefined) counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [base, count] of counts) {
    if (count > bestCount) {
      best = base;
      bestCount = count;
    }
  }
  return best;
}

function hostOf(url: unknown): { scheme?: string; host?: string } {
  if (isNode(url) && Array.isArray(url.host)) {
    const host = url.host.map((part: unknown) => String(part)).join(".");
    const port = typeof url.port === "string" && url.port !== "" ? `:${url.port}` : "";
    const scheme = typeof url.protocol === "string" ? url.protocol : undefined;
    return { scheme, host: `${host}${port}` };
  }
  const raw =
    typeof url === "string" ? url : isNode(url) && typeof url.raw === "string" ? url.raw : "";
  const [, scheme, host] = RAW_HOST.exec(raw) ?? [];
  return { scheme, host };
}

function isNode(value: unknown): value is SpecNode {
  return typeof value === "object" && value !== null;
}

/** The text with each variable filled, or `undefined` when one has no value. */
function fill(text: string, variables: ReadonlyMap<string, string>): string | undefined {
  let unknown = false;
  const filled = text.replace(VARIABLE, (_, name: string) => {
    const value = variables.get(name.trim());
    if (value === undefined) unknown = true;
    return value ?? "";
  });
  return unknown ? undefined : filled;
}
