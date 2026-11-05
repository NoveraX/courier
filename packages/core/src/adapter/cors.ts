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
 * if (isPreflight(request) && !answerPreflight(request, allowedOrigins)) refuse(request);
 * ```
 */
export function isPreflight(request: Request): boolean {
  return (
    request.method === "OPTIONS" &&
    !!request.headers.get("Origin") &&
    request.headers.has("Access-Control-Request-Method")
  );
}

/**
 * Answer a CORS preflight from a listed origin. A preflight from any other
 * is the caller's to refuse, as it refuses that page's calls.
 *
 * @param request - The incoming request
 * @param allowedOrigins - The configured origins
 * @returns The answer, or `undefined` when the request is not a preflight
 * from an origin `allowedOrigins` lists
 *
 * @example
 * ```ts
 * const preflight = answerPreflight(request, ["https://admin.example.com"]);
 * if (preflight) return preflight;
 * ```
 */
export function answerPreflight(
  request: Request,
  allowedOrigins?: readonly string[],
): Response | undefined {
  const origin = request.headers.get("Origin");
  if (!origin || !isPreflight(request) || !isOriginListed(origin, allowedOrigins)) return undefined;

  /* A listed origin is trusted with the proxy, so it may send whatever the
     proxy's own allowlists then decide to carry upstream. */
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST",
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  });
  const requested = request.headers.get("Access-Control-Request-Headers");
  if (requested) headers.set("Access-Control-Allow-Headers", requested);
  return new Response(null, { status: 204, headers });
}

/**
 * Give a listed origin permission to read an answer.
 *
 * @param request - The request the answer is for
 * @param response - The answer
 * @param allowedOrigins - The configured origins
 * @returns The answer, with the permission when the request's origin is listed
 *
 * @example
 * ```ts
 * return withCorsHeaders(request, await handleGet(request), allowedOrigins);
 * ```
 */
export function withCorsHeaders(
  request: Request,
  response: Response,
  allowedOrigins?: readonly string[],
): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !isOriginListed(origin, allowedOrigins)) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
  /* A page on another origin reads only the headers it is told it may. */
  const readable = [...response.headers.keys()].filter((name) => name !== "set-cookie");
  if (readable.length > 0) headers.set("Access-Control-Expose-Headers", readable.join(", "));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
