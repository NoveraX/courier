import type { InferClient } from "../client";
import { buildClientProxy } from "../client";
import { shapeOfSource } from "../client/shape";
import type { BrowserApi } from "../define/exposed-api";
import { composeBackend, type StreamingFactories } from "../transport/compose-backend";
import {
  createProxyHTTPExecutor,
  createProxySSEFactory,
  createProxyWSChannelFactory,
  createProxyWSPushFactory,
} from "../transport/proxy";
import { sourceFromBoundary } from "./from-boundary";
import { mergeProxyPath, type ProxyPath } from "./proxy-path";
import type { ProxyCallerArguments, ProxyCallerDefaults } from "./types";

/**
 * Create a typed proxy client for browser → server mode.
 * Sends requests to a proxy endpoint that forwards them to the backend.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (proxyPath, timeout, credentials, etc.)
 *
 * In a browser bundle, pass the `boundary` from `defineBoundary` and import
 * the API as a type only: `source: api` would ship the API's definition —
 * its upstream URLs, its handlers' imports — to every browser. `source` is
 * for code that runs on the server, where the definition already is.
 *
 * @example
 * ```ts
 * import type { api } from "./api";
 * import { boundary } from "./boundary"; // defineBoundary({ source: "api", expose: { … } })
 *
 * const client = createProxyCaller<typeof api>("api", {
 *   boundary,
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
  ...defaults: ProxyCallerArguments<TApi>
): InferClient<BrowserApi<TApi>>;

export function createProxyCaller(source: string, defaults: ProxyCallerDefaults = {}): unknown {
  /* A boundary is the narrow form of the same thing, and the one that keeps
     the definition out of the browser, so it wins where both are given. */
  const apiSource = defaults.boundary ? sourceFromBoundary(defaults.boundary) : defaults.source;
  // Per-transport merge: caller-level `proxyPath` wins over the source's
  // own `options.proxyPath` on a field-by-field basis. Either side may
  // be partial or undefined; missing transports fall back to built-in
  // defaults inside `resolveProxyPath` at request time.
  const sourceProxyPath = defaults.boundary?.proxyPath ?? readSourceProxyPath(apiSource);
  const mergedProxyPath = mergeProxyPath(defaults.proxyPath, sourceProxyPath);
  const effectiveDefaults: ProxyCallerDefaults = {
    ...defaults,
    proxyPath: mergedProxyPath,
    deduplicate: defaults.deduplicate ?? readSourceOptions(apiSource)?.deduplicate,
  };

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
    const wsDefaults = { proxyPath: mergedProxyPath, ws: defaults.ws };
    streaming.wsChannel = createProxyWSChannelFactory(source, wsDefaults);
    streaming.wsPush = createProxyWSPushFactory(source, wsDefaults);
  }

  const backend = composeBackend(apiSource, http, streaming, {
    exhaustive: defaults.boundary !== undefined,
  });
  return buildClientProxy(backend, {}, false, shapeOfSource(apiSource));
}

/**
 * Pull `options.proxyPath` from a `defineApi` result without coupling to
 * the `DefinedApi` generic chain. Returns `undefined` if the source has
 * no embedded proxy metadata (older sources, ad-hoc objects, etc.).
 */
function readSourceProxyPath(
  apiSource: Record<string, unknown> | undefined,
): ProxyPath | undefined {
  return readSourceOptions(apiSource)?.proxyPath;
}

/** The options a `defineApi` result carries, read without its generic chain. */
function readSourceOptions(
  apiSource: Record<string, unknown> | undefined,
): { proxyPath?: ProxyPath; deduplicate?: boolean } | undefined {
  return (apiSource as { options?: { proxyPath?: ProxyPath; deduplicate?: boolean } } | undefined)
    ?.options;
}
