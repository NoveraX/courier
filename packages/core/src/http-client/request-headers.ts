/**
 * Lay one set of request headers over another.
 *
 * A name present in both takes its value from `over`; every other header of
 * either set is kept, one named `__proto__` too. Nothing is filtered: both
 * sets were written by the application, not received from a browser.
 *
 * @param base - Headers that apply unless something more specific names them
 * @param over - Headers that win where both name the same header
 * @returns A new `Headers` holding the combination
 *
 * @example
 * ```ts
 * overlayHeaders({ "x-api-key": "k", accept: "text/plain" }, { accept: "application/json" });
 * // → x-api-key: k, accept: application/json
 * ```
 */
export function overlayHeaders(base?: HeadersInit, over?: HeadersInit): Headers {
  const merged = headersFrom(base);
  headersFrom(over).forEach((value, name) => {
    merged.set(name, value);
  });
  return merged;
}

/* A new `Headers` of any form a caller gives them: a record as its own entries, since Node's
   conversion of a whole record drops a key `__proto__`. */
function headersFrom(init: HeadersInit | undefined): Headers {
  const whole = init === undefined || typeof init !== "object" || init instanceof Headers;
  if (whole || Symbol.iterator in init) return new Headers(init);
  return new Headers(Object.entries(init));
}

/**
 * Headers that describe one connection, or the framing of one message, rather
 * than the request (RFC 9110 §7.6.1). `fetch` sets them for the connection it
 * opens; copied from an incoming request, they made it refuse to send —
 * "invalid keep-alive header", or a content length the new body did not have.
 */
const CONNECTION_HEADERS: readonly string[] = [
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * Drop the headers that belong to a connection rather than to the request,
 * together with any header the `Connection` header names as its own.
 *
 * @param headers - The headers about to be sent; edited in place
 * @returns The same `Headers`, for chaining
 *
 * @example
 * ```ts
 * withoutConnectionHeaders(new Headers({ connection: "keep-alive", cookie: "a=1" }));
 * // → cookie: a=1
 * ```
 */
export function withoutConnectionHeaders(headers: Headers): Headers {
  const named = headers.get("connection")?.split(",") ?? [];
  for (const name of [...CONNECTION_HEADERS, ...named]) {
    const trimmed = name.trim();
    /* `Headers.delete` throws on a name that is not a token, and the
       Connection value came from someone else's request. */
    if (HEADER_NAME.test(trimmed)) headers.delete(trimmed);
  }
  return headers;
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
