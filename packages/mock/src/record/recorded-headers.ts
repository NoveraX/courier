/* What authenticates a call, or a session it opens, is never written down:
   a recording is a file that gets committed and shared. */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

/**
 * An answer's headers as a recording keeps them: every one but those that
 * carry credentials.
 *
 * @param headers - The answer's headers
 * @returns Each header kept, by its lower-case name
 * @example
 * ```ts
 * recordedHeaders(new Headers({ "set-cookie": "sid=1", etag: '"a"' })); // → { etag: '"a"' }
 * ```
 */
export function recordedHeaders(headers: Headers): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (!CREDENTIAL_HEADERS.has(name)) kept[name] = value;
  }
  return kept;
}
