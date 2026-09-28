import { appendQuery } from "../utils/query-string";
import { encodeWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import { subscribeSSE } from "./sse/sse-client";
import type { SSESubscription } from "./types";

const TRAILING_SLASHES = /\/+$/;
const EDGE_SLASHES = /^\/+|\/+$/g;

/** Build a direct SSE URL: baseURL/prefix/method?variables */
export function buildDirectSSEUrl(
  baseURL: string,
  prefix: string,
  method: string,
  variables?: Record<string, unknown>,
): string {
  /* One slash between the parts, however each is written: a prefix "/api/"
     and a path "events" join as "/api/events". */
  const base = baseURL.replace(TRAILING_SLASHES, "");
  const group = prefix.replace(EDGE_SLASHES, "");
  const tail = method.replace(EDGE_SLASHES, "");
  const path = `${base}${group ? `/${group}` : ""}${tail ? `/${tail}` : ""}`;

  return variables ? appendQuery(path, variables) : path;
}

/** Build a proxy SSE URL: `sseUrl?_s=source&_g=group&_m=method&_v={…}` */
export function buildProxySSEUrl(
  sseUrl: string,
  source: string,
  group: string,
  method: string,
  variables?: Record<string, unknown>,
): string {
  const params = new URLSearchParams({ _s: source, _m: method });
  if (group) params.set("_g", group);
  const encoded = encodeWireVariables(variables);
  if (encoded) params.set(WIRE_VARIABLES_KEY, encoded);

  return `${sseUrl}${sseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}

/** Execute SSE subscription with merged headers */
export function executeSSE<TData = unknown>(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  onResponse?: (response: Response) => void,
): SSESubscription<TData> {
  return subscribeSSE<TData>(url, {
    headers,
    signal,
    ...(onResponse && { onResponse }),
  });
}
