/**
 * Combine the options of two `.with()` calls, the later one on top.
 *
 * Each call used to replace the options before it outright, so a token set
 * on the client was lost once a group added a request id of its own.
 * Headers are merged name by name; any other option the later call sets
 * replaces the earlier value.
 *
 * @param options - The options already in effect
 * @param next - The options the later `.with()` gave
 * @returns The options that apply
 *
 * @example
 * ```ts
 * mergeCallOptions({ headers: { authorization: "t" } }, { headers: { "x-id": "1" } });
 * // → { headers: Headers { authorization: "t", "x-id": "1" } }
 * ```
 */
export function mergeCallOptions(
  options: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...options, ...next };
  if (options.headers === undefined || next.headers === undefined) return merged;

  const headers = headersOf(options.headers);
  headersOf(next.headers).forEach((value, name) => {
    headers.set(name, value);
  });
  return { ...merged, headers };
}

/* Headers as `.with()` accepts them: a Headers, a list of pairs, or a
   record whose unset entries are skipped. */
function headersOf(value: unknown): Headers {
  if (value instanceof Headers) return new Headers(value);
  const headers = new Headers();
  const entries = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
      ? Object.entries(value)
      : [];
  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const [name, headerValue] = entry;
    if (typeof name === "string" && typeof headerValue === "string")
      headers.append(name, headerValue);
  }
  return headers;
}
