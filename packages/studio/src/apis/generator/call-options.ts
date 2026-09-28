/**
 * The options object of a call a generated closure makes, without its
 * braces: the body, the query string, how the answer is read and the body's
 * own media type, each only when there is one.
 *
 * @param body - The body entry, e.g. `json: body`, or `null`
 * @param searchParams - The query string's object, or `null`
 * @param read - The response type entry, e.g. `responseType: "text"`, or `null`
 * @param media - The media type the body is sent as, when it is not plain JSON, or `null`
 * @returns The entries, joined
 * @example
 * ```ts
 * callOptions("json: body", "{ dryRun }", null); // → 'json: body, searchParams: { dryRun }'
 * ```
 */
export function callOptions(
  body: string | null,
  searchParams: string | null,
  read: string | null,
  media: string | null = null,
): string {
  const entries = [
    body,
    searchParams === null ? null : `searchParams: ${searchParams}`,
    read,
    media === null ? null : `headers: { "content-type": ${JSON.stringify(media)} }`,
  ];
  return entries.filter((entry) => entry !== null).join(", ");
}
