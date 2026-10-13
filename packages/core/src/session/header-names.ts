/* RFC 9110's field-name: a token. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Headers no option carries from one request to another: the credentials a
 * session sends on terms of its own, and the headers of a connection.
 */
const NEVER_CARRIED: ReadonlySet<string> = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "expect",
  "host",
  "keep-alive",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Headers that claim a client's address, every one an API reads it from —
 * `request-ip` reads them in this order. Copied from a request, they let
 * whoever wrote them choose the address an API believes, so they carry the
 * user's address only as `clientAddress` writes it.
 */
const ADDRESS_HEADERS: ReadonlySet<string> = new Set([
  "x-client-ip",
  "x-forwarded-for",
  "cf-connecting-ip",
  "fastly-client-ip",
  "true-client-ip",
  "x-real-ip",
  "x-cluster-client-ip",
  "x-forwarded",
  "forwarded-for",
  "forwarded",
  "x-appengine-user-ip",
  "cf-pseudo-ipv4",
  "x-original-forwarded-for",
]);

/** Headers `forward` has an option of its own for, and the option. */
const FORWARD_OPTION: ReadonlyMap<string, string> = new Map([
  ["user-agent", "userAgent"],
  ["accept-language", "locale"],
  ["traceparent", "trace"],
  ["tracestate", "trace"],
  ["x-request-id", "requestId"],
]);

/**
 * Why a value cannot name a header a session or `forward` sends — or
 * `undefined` when it can.
 *
 * @param value - The name, as configured
 * @param carries - `"address"` for a header `clientAddress` writes the user's address in
 * @returns The reason, or `undefined`
 * @example
 * ```ts
 * headerNameProblem("x-tenant"); // undefined
 * headerNameProblem("x-real-ip"); // "\"x-real-ip\" claims a client's address …"
 * headerNameProblem("x-real-ip", "address"); // undefined
 * ```
 */
export function headerNameProblem(value: unknown, carries?: "address"): string | undefined {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    return `${JSON.stringify(value)} is not a header name`;
  }
  const name = value.toLowerCase();
  if (name === "cookie" || name === "authorization") {
    return `"${value}" is sent by the session alone, for the cookies and the token it names`;
  }
  if (NEVER_CARRIED.has(name)) {
    return `"${value}" belongs to one connection, and is never carried`;
  }
  if (ADDRESS_HEADERS.has(name) && carries !== "address") {
    return `"${value}" claims a client's address, which whoever wrote the request chose; name it in clientAddress, which sends the user's address in it`;
  }
  return undefined;
}

/**
 * The `forward` option a header has instead of being listed, if any.
 *
 * @param name - A header name
 * @returns The option's name, or `undefined`
 * @example
 * ```ts
 * forwardOptionFor("User-Agent"); // "userAgent"
 * ```
 */
export function forwardOptionFor(name: string): string | undefined {
  return FORWARD_OPTION.get(name.toLowerCase());
}
