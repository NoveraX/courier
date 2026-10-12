/**
 * Where a stream is: the address a direct caller opens it at, and the proxy
 * route a browser reaches it through. Kept apart from the stream client, so
 * code that only addresses a stream does not carry the client.
 */

import { appendQuery } from "../utils/query-string";
import { withoutEdgeSlashes, withoutTrailingSlashes } from "../utils/trim-slashes";
import { encodeWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";

/** Build a direct SSE URL: baseURL/prefix/method?variables */
export function buildDirectSSEUrl(
  baseURL: string,
  prefix: string,
  method: string,
  variables?: Record<string, unknown>,
): string {
  /* One slash between the parts, however each is written: a prefix "/api/"
     and a path "events" join as "/api/events". */
  const base = withoutTrailingSlashes(baseURL);
  const group = withoutEdgeSlashes(prefix);
  const tail = withoutEdgeSlashes(method);
  const path = `${base}${group ? `/${group}` : ""}${tail ? `/${tail}` : ""}`;

  return variables ? appendQuery(path, variables) : path;
}

/** Build a proxy SSE URL: `sseUrl?_s=source&_g=group&_m=method&_v={…}` */
export function buildProxySSEUrl(
  sseUrl: string,
  source: string,
  group: string,
  method: string,
  variables?: unknown,
): string {
  const params = new URLSearchParams({ _s: source, _m: method });
  if (group) params.set("_g", group);
  const encoded = encodeWireVariables(variables);
  if (encoded) params.set(WIRE_VARIABLES_KEY, encoded);

  return `${sseUrl}${sseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}
