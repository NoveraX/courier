import type { PlacedEndpoint } from "@noverax/courier/internal";

import type { RecordingProblem } from "./types";

const VERB: Readonly<Record<string, string>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  del: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  query: "QUERY",
};

/* What `fixturesToHar` names a call by when no request was recorded for it. */
const CALL_URL = "courier:";

/**
 * Whether the request a call was recorded as still goes where its endpoint
 * sends it: the same HTTP method, and a path its route matches. The path is
 * read from its end, a route's parameter matching any segment, so a call
 * recorded against another host or base path — staging, a mock — still
 * lines up with its route.
 *
 * @param endpoint - The endpoint as the definition places it now
 * @param request - The HTTP request the call was recorded as, if one was
 * @returns How the route changed, or `undefined` while it fits
 * @example
 * ```ts
 * routeProblem(products.get, { method: "GET", url: "https://shop.example/products/p_1" }); // → undefined
 * ```
 */
export function routeProblem(
  endpoint: PlacedEndpoint,
  request: { method: string; url: string } | undefined,
): RecordingProblem | undefined {
  if (!request || request.url.startsWith(CALL_URL)) return undefined;
  const verb = VERB[endpoint.method] ?? endpoint.method.toUpperCase();
  const sent = request.method.toUpperCase();
  if (sent !== verb) {
    return {
      kind: "method-changed",
      message: `recorded as ${sent}, but the endpoint now sends ${verb}`,
    };
  }
  const recorded = segmentsOf(request.url);
  const route = segmentsOf(endpoint.path);
  if (recorded === undefined || route === undefined || fits(recorded, route)) return undefined;
  return {
    kind: "path-changed",
    message: `recorded at /${recorded.join("/")}, but the endpoint now sends to /${route.join("/")}`,
  };
}

function segmentsOf(address: string): string[] | undefined {
  let pathname: string;
  try {
    pathname = new URL(address, "http://recorded.invalid/").pathname;
  } catch {
    /* An address no URL can be read from says nothing about the route. */
    return undefined;
  }
  return pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map(decoded);
}

/* The route's segments, from the end: a parameter takes any segment, the rest only themselves. */
function fits(recorded: readonly string[], route: readonly string[]): boolean {
  if (route.length > recorded.length) return false;
  const tail = recorded.slice(recorded.length - route.length);
  return route.every((segment, at) => segment.startsWith(":") || segment === tail[at]);
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    /* A segment that is not valid percent-encoding is compared as written. */
    return segment;
  }
}
