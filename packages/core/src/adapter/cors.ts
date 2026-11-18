/**
 * CORS for the pages `allowedOrigins` names.
 *
 * Admitting an origin on the server is half of what a browser needs. A call
 * with a JSON body or a header of its own is preceded by a preflight the
 * browser must see answered, and an answer the page may not read is as good
 * as a refusal. Only listed origins are answered: the development allowance
 * for local ports lets such a page's requests through, but never lets it read
 * a user's data.
 */

import type { EntryRequest } from "./entry-request";
import { isOriginListed } from "./origin-policy";

/** How long a browser may reuse a preflight's answer, in seconds. */
const PREFLIGHT_MAX_AGE = "600";

/**
 * Whether a request is a CORS preflight: an OPTIONS request from a page,
 * naming the method its call is to be sent with.
 *
 * @param request - The incoming request
 * @returns `true` for a preflight
 *
 * @example
 * ```ts
 * if (isPreflight(request) && !preflightGrant(request, allowedOrigins)) refuse(request);
 * ```
 */
export function isPreflight(request: EntryRequest): boolean {
  return (
    request.method === "OPTIONS" &&
    !!request.headers.get("origin") &&
    request.headers.has("access-control-request-method")
  );
}

/**
 * What a CORS preflight from a listed origin is answered with, a 204's
 * headers. A preflight from any other is the caller's to refuse, as it
 * refuses that page's calls.
 *
 * @param request - The incoming request
 * @param allowedOrigins - The configured origins
 * @returns The headers, by their names in lower case, or `undefined` when the
 * request is not a preflight from an origin `allowedOrigins` lists
 *
 * @example
 * ```ts
 * const granted = preflightGrant(request, ["https://admin.example.com"]);
 * if (granted) return new Response(null, { status: 204, headers: granted });
 * ```
 */
export function preflightGrant(
  request: EntryRequest,
  allowedOrigins?: readonly string[],
): Record<string, string> | undefined {
  const origin = request.headers.get("origin");
  if (!origin || !isPreflight(request) || !isOriginListed(origin, allowedOrigins)) return undefined;

  /* A listed origin is trusted with the proxy, so it may send whatever the
     proxy's own allowlists then decide to carry upstream. */
  const headers: Record<string, string> = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST",
    "access-control-max-age": PREFLIGHT_MAX_AGE,
    vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  };
  const requested = request.headers.get("access-control-request-headers");
  if (requested) headers["access-control-allow-headers"] = requested;
  return headers;
}

/**
 * The listed origin a request comes from: the page its answer is to let
 * read it.
 *
 * @param request - The incoming request
 * @param allowedOrigins - The configured origins
 * @returns The origin, or `undefined` for a request from no listed one
 *
 * @example
 * ```ts
 * const reader = listedReader(request, ["https://admin.example.com"]);
 * ```
 */
export function listedReader(
  request: EntryRequest,
  allowedOrigins?: readonly string[],
): string | undefined {
  const origin = request.headers.get("origin");
  return origin && isOriginListed(origin, allowedOrigins) ? origin : undefined;
}

/**
 * What lets a page read an answer: the headers to set on it, given the
 * names of those it has, and `Origin` added to its `Vary`. A page on
 * another origin reads only the headers it is told it may, never a cookie.
 *
 * @param reader - The listed origin of the page
 * @param names - The names of the answer's own headers, in lower case
 * @returns The headers to set, by their names in lower case
 *
 * @example
 * ```ts
 * readGrant("https://admin.example.com", ["content-type"]);
 * // { "access-control-allow-origin": "https://admin.example.com", …, "access-control-expose-headers": "content-type" }
 * ```
 */
export function readGrant(reader: string, names: Iterable<string>): Record<string, string> {
  const grant: Record<string, string> = {
    "access-control-allow-origin": reader,
    "access-control-allow-credentials": "true",
  };
  const readable = [...names].filter((name) => name !== "set-cookie").sort();
  if (readable.length > 0) grant["access-control-expose-headers"] = readable.join(", ");
  return grant;
}

/**
 * A web answer a listed origin may read, by `readGrant`.
 *
 * @param response - The answer
 * @param reader - The listed origin of the page that asked
 * @returns The answer, with the permission
 *
 * @example
 * ```ts
 * return reader === undefined ? response : withReadGrant(response, reader);
 * ```
 */
export function withReadGrant(response: Response, reader: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(readGrant(reader, response.headers.keys()))) {
    headers.set(name, value);
  }
  headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
