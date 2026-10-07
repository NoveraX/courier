/* RFC 9110's field-name: a token. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Headers no option carries from one request to another: the credentials a
 * session sends on terms of its own, the headers of a connection, and the
 * ones that claim a client's address, which `clientAddress` writes from what
 * the framework vouches for.
 */
const NEVER_CARRIED: ReadonlySet<string> = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "expect",
  "forwarded",
  "host",
  "keep-alive",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-real-ip",
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
 * @returns The reason, or `undefined`
 * @example
 * ```ts
 * headerNameProblem("x-tenant"); // undefined
 * headerNameProblem("cookie"); // "\"cookie\" is sent by the session alone …"
 * ```
 */
export function headerNameProblem(value: unknown): string | undefined {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    return `${JSON.stringify(value)} is not a header name`;
  }
  const name = value.toLowerCase();
  if (name === "cookie" || name === "authorization") {
    return `"${value}" is sent by the session alone, for the cookies and the token it names`;
  }
  if (NEVER_CARRIED.has(name)) {
    return `"${value}" belongs to one connection or claims a client's address, and is never carried`;
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
