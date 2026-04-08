import { subscribeSSE } from "./sse/sse-client";
import type { SSESubscription } from "./types";

/** Build a direct SSE URL: baseURL/prefix/method?variables */
export function buildDirectSSEUrl(
  baseURL: string,
  prefix: string,
  method: string,
  variables?: Record<string, unknown>,
): string {
  const base = baseURL.replace(/\/$/, "");
  const groupPath = prefix ? `/${prefix.replace(/^\//, "")}` : "";
  const path = `${base}${groupPath}/${method}`;

  return variables ? appendQueryParams(path, variables) : path;
}

/** Build a proxy SSE URL: sseUrl?_s=source&_g=group&_m=method&variables */
export function buildProxySSEUrl(
  sseUrl: string,
  source: string,
  group: string,
  method: string,
  variables?: Record<string, unknown>,
): string {
  const params: Record<string, unknown> = { _s: source, _m: method };
  if (group) params._g = group;

  const base = appendQueryParams(sseUrl, params);
  return variables ? appendQueryParams(base, variables) : base;
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

function appendQueryParams(url: string, params: Record<string, unknown>): string {
  const separator = url.includes("?") ? "&" : "?";
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);

  return entries.length > 0 ? `${url}${separator}${entries.join("&")}` : url;
}
