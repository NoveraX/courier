import type { InferClient } from "../client";
import { buildClientProxy } from "../client";
import { shapeOfSource } from "../client/shape";
import type { BrowserApi } from "../define/exposed-api";
import { composeBackend, type StreamingFactories } from "../transport/compose-backend";
import { createProxyHTTPExecutor } from "../transport/proxy/http";
import { proxyStreamingFactories } from "../transport/proxy-streaming";
import { sourceFromBoundary } from "./from-boundary";
import { mergeProxyPath, type ProxyPath } from "./proxy-path";
import type { ProxyCallerArguments, ProxyCallerDefaults } from "./types";

/**
 * Create a proxy client typed from the API it is given as `source`, for code
 * that runs on the server, where the definition already is. A browser bundle
 * names the API as a type and passes a `boundary` instead (next overload).
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration, with the API itself as `source`
 * @returns A client whose groups and endpoints are the API's
 * @example
 * ```ts
 * const client = createProxyCaller("api", { source: api, proxyPath: { http: "https://app.example/api/request" } });
 * await client.users.getAll();
 * ```
 */
export function createProxyCaller<TApi extends Record<string, unknown>>(
  source: string,
  defaults: ProxyCallerDefaults & { source: TApi },
): InferClient<BrowserApi<TApi>>;

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

  /* Streams and channels are told apart by the endpoints' schemas, so a
     client with no source sends every call as HTTP. Their client code is
     loaded on the first stream or channel, so an application that makes
     none does not carry it, and their proxy paths are resolved on the first
     call, so a missing `proxyPath.ws` is reported there. A socket carries
     defaults.headers in its first frame, which the proxy reads as its
     handshake's: a browser WebSocket cannot send headers on its upgrade. */
  const streaming: StreamingFactories = apiSource
    ? proxyStreamingFactories(source, {
        sse: {
          proxyPath: mergedProxyPath,
          headers: defaults.headers,
          credentials: defaults.credentials,
        },
        ws: { proxyPath: mergedProxyPath, ws: defaults.ws, headers: defaults.headers },
      })
    : {};

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
