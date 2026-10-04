import type { ProxyPath } from "../../proxy-caller/proxy-path";
import type { ResolveOrigin } from "../../proxy-caller/resolve-path";
import { resolveProxyPath } from "../../proxy-caller/resolve-path";
import { executeSSE } from "../../realtime/caller-sse";
import { buildProxySSEUrl } from "../../realtime/sse-address";
import { layerHeaders } from "../../utils/layer-headers";
import type { SSEFactory } from "../types";

export interface ProxySSEDefaults {
  /**
   * Per-transport proxy endpoint configuration. Only the `sse` field is
   * read here; passing the full `ProxyPath` allows callers to share a
   * single object across HTTP/SSE/WS factory constructors.
   *
   * Resolution is performed lazily on each `subscribeSSE` call so the
   * factory can be constructed in SSR contexts without `globalThis.location`
   * being defined yet.
   */
  proxyPath?: ProxyPath;
  /**
   * Optional explicit origin (`{ protocol, host }`) used when resolving
   * relative `proxyPath.sse` values. Required in Node contexts where
   * `globalThis.location` is undefined — e.g. the Studio Playground proxy
   * executor running inside the user-app process. Browser callers can
   * leave this undefined; `resolveProxyPath` falls back to `location`.
   */
  origin?: ResolveOrigin;
  /** Default headers merged into every SSE connection */
  headers?: Record<string, string>;
}

/**
 * Create a proxy-mode SSE factory that connects to the server's SSE proxy
 * endpoint with source/group/method as query parameters.
 *
 * URL pattern: `{resolved sse path}?_s={source}&_g={group}&_m={method}&_v={JSON variables}`
 *
 * Studio instrumentation lives on the server-side `createSSEHandler` —
 * it owns the canonical connectionId, upstream headers and full lifecycle.
 * The browser side intentionally does NOT wrap with `instrumentSSE` to
 * avoid producing a duplicate Timeline entry.
 */
export function createProxySSEFactory(source: string, defaults: ProxySSEDefaults = {}): SSEFactory {
  const { proxyPath, origin, headers: defaultHeaders } = defaults;

  return function subscribeSSE(group, method, variables, options) {
    const headers = layerHeaders(defaultHeaders, options.headers);
    const sseBase = resolveProxyPath("sse", proxyPath, origin);
    const url = buildProxySSEUrl(sseBase, source, group, method, variables);
    return executeSSE(url, headers);
  };
}
