/* Headers that belong to one hop, or that the call to the source's server
   sets itself from its own body and target. */
const NOT_FORWARDED: ReadonlySet<string> = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-type",
  "accept-encoding",
  "origin",
  "referer",
  "te",
  "trailer",
]);

/* Headers of an answer that describe its bytes on the wire: the mock answers
   with the data again, serialized and encoded its own way. */
const NOT_RETURNED: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
  "content-type",
]);

/**
 * The headers of a request to the mock worth sending on to the source's own
 * server: its credentials and its own headers, but none of the hop's.
 *
 * @param headers - The request's headers
 * @returns The headers to send on
 * @example
 * ```ts
 * forwardedHeaders(new Headers({ authorization: "Bearer t", host: "localhost:7011" })); // → { authorization: "Bearer t" }
 * ```
 */
export function forwardedHeaders(headers: Headers): Record<string, string> {
  return keep(
    headers,
    (name) => !NOT_FORWARDED.has(name) && !name.startsWith("sec-") && !name.startsWith("proxy-"),
  );
}

/**
 * The headers of the source's answer the mock answers with: all but those
 * describing its bytes, which the mock's own answer sets.
 *
 * @param headers - The answer's headers
 * @returns The headers to answer with
 * @example
 * ```ts
 * returnedHeaders(new Headers({ "x-request-id": "1", "content-length": "12" })); // → { "x-request-id": "1" }
 * ```
 */
export function returnedHeaders(headers: Headers): Record<string, string> {
  return keep(headers, (name) => !NOT_RETURNED.has(name));
}

function keep(headers: Headers, wanted: (name: string) => boolean): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of headers) if (wanted(name)) kept[name] = value;
  return kept;
}
