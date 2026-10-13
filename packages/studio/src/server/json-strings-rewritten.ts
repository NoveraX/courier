/**
 * A value as `JSON.stringify` sends it — an `Error`'s or any other class
 * instance's own fields, what a `toJSON` returns — with every string and
 * every key rewritten, as deep as it goes.
 *
 * @param value - The value, as a route hands it to `res.json`
 * @param rewrite - What rewrites a string
 * @returns A copy that serializes as the value would, rewritten
 * @throws The serializer's error for a value JSON cannot hold, as `res.json` would throw it
 * @example
 * ```ts
 * jsonStringsRewritten({ error: "open '/Users/ana/x'" }, scrub); // → { error: "open '~/x'" }
 * ```
 */
export function jsonStringsRewritten(value: unknown, rewrite: (text: string) => string): unknown {
  if (typeof value === "string") return rewrite(value);
  const text = JSON.stringify(value);
  return text === undefined ? value : rewritten(JSON.parse(text), rewrite);
}

function rewritten(value: unknown, rewrite: (text: string) => string): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value)) return value.map((item) => rewritten(item, rewrite));
  if (value === null || typeof value !== "object") return value;
  const entries: Array<[string, unknown]> = Object.entries(value);
  return Object.fromEntries(entries.map(([key, item]) => [rewrite(key), rewritten(item, rewrite)]));
}
