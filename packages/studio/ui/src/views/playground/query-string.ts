/**
 * The query string a Courier client writes for a read's variables: a list
 * repeats its key, an object spreads its fields into keys of their own
 * (OpenAPI's default `style: form, explode: true`), `null` and `undefined`
 * are left out, a date is sent as ISO text and anything nested deeper as
 * JSON.
 *
 * @param variables - The variables left once the path is filled
 * @returns `?key=value&…`, or `""` when there is nothing to send
 *
 * @example
 * ```ts
 * queryString({ q: "ada lovelace", tag: ["a", "b"] }); // → "?q=ada%20lovelace&tag=a&tag=b"
 * ```
 */
export function queryString(variables: Readonly<Record<string, unknown>>): string {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(variables)) {
    if (Array.isArray(value)) {
      for (const item of value) pushScalar(entries, key, item);
    } else if (isPlainRecord(value)) {
      for (const [field, inner] of Object.entries(value)) pushScalar(entries, field, inner);
    } else {
      pushScalar(entries, key, value);
    }
  }
  if (entries.length === 0) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

function pushScalar(entries: [string, string][], key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  entries.push([key, scalarText(value)]);
}

function scalarText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
