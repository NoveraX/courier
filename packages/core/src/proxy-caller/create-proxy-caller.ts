import type { InferClient } from "../client";
import { buildClientProxy } from "../client";
import { composeBackend, type StreamingFactories } from "../transport/compose-backend";
import {
  createProxyHTTPExecutor,
  createProxySSEFactory,
  createProxyWSChannelFactory,
  createProxyWSPushFactory,
} from "../transport/proxy";
import { mergeProxyPath, type ProxyPath } from "./proxy-path";
import type { ProxyCallerDefaults } from "./types";

/**
 * Create a typed proxy client for browser → server mode.
 * Sends requests to a proxy endpoint that forwards them to the backend.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (proxyPath, timeout, credentials, etc.)
 *
 * @example
 * ```ts
 * const client = createProxyCaller<typeof api>("api", {
 *   source: api,
 *   proxyPath: { http: "/api/request", sse: "/api/sse", ws: "wss://realtime.example.com" },
 * });
 *
 * // Grouped: client.users.getAll()
 * // Flat:    client.getFinances()
 * // Mixed:   both work simultaneously
 *
 * // .raw and .with() — at client level (applies to all calls):
 * await client.raw.users.getById({ id: 1 })
 * await client.with({ timeout: 5000 }).users.getAll()
 *
 * // .raw and .with() — at group level:
 * await client.users.raw.getById({ id: 1 })
 * await client.users.with({ timeout: 5000 }).getAll()
 *
 * // .raw and .with() — at flat method level:
 * await client.getFinances.raw()
 * await client.getFinances.with({ timeout: 5000 })()
 * ```
 */
export function createProxyCaller<TApi>(
  source: string,
  defaults?: ProxyCallerDefaults,
): InferClient<TApi>;

export function createProxyCaller(source: string, defaults: ProxyCallerDefaults = {}): unknown {
  const apiSource = defaults.source;
  // Per-transport merge: caller-level `proxyPath` wins over the source's
  // own `options.proxyPath` on a field-by-field basis. Either side may
  // be partial or undefined; missing transports fall back to built-in
  // defaults inside `resolveProxyPath` at request time.
  const sourceProxyPath = readSourceProxyPath(apiSource);
  const mergedProxyPath = mergeProxyPath(defaults.proxyPath, sourceProxyPath);
  const effectiveDefaults: ProxyCallerDefaults = { ...defaults, proxyPath: mergedProxyPath };

  const http = createProxyHTTPExecutor(source, effectiveDefaults);

  // Streaming primitives are only constructed when apiSource is provided —
  // transport detection in composeBackend requires endpoint schema. Without
  // it, all calls fall through to HTTP. Construction is always safe (no
  // network), so we can wire SSE and WS unconditionally — `resolveProxyPath`
  // is invoked lazily on the first subscribe / connect call, and WS-specific
  // misconfiguration surfaces there as `WS_PATH_NOT_CONFIGURED`.
  const streaming: StreamingFactories = {};
  if (apiSource) {
    streaming.sse = createProxySSEFactory(source, {
      proxyPath: mergedProxyPath,
      headers: defaults.headers,
    });
    // ⚠️ defaults.headers is intentionally NOT forwarded to WS factories.
    // Browser WebSocket cannot send custom HTTP headers in the upgrade
    // handshake. See `ProxyWSDefaults` for supported auth alternatives.
    streaming.wsChannel = createProxyWSChannelFactory(source, { proxyPath: mergedProxyPath });
    streaming.wsPush = createProxyWSPushFactory(source, { proxyPath: mergedProxyPath });
  }

  const backend = composeBackend(apiSource, http, streaming);
  return buildClientProxy(backend);
}

/**
 * Pull `options.proxyPath` from a `defineApi` result without coupling to
 * the `DefinedApi` generic chain. Returns `undefined` if the source has
 * no embedded proxy metadata (older sources, ad-hoc objects, etc.).
 */
function readSourceProxyPath(
  apiSource: Record<string, unknown> | undefined,
): ProxyPath | undefined {
  if (!apiSource) return undefined;
  const options = (apiSource as { options?: { proxyPath?: ProxyPath } }).options;
  return options?.proxyPath;
}
