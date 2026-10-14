import type { InferClient } from "../client";
import { buildClientProxy } from "../client";
import { shapeOfSource } from "../client/shape";
import type { BrowserApi, RoutedApi } from "../define/exposed-api";
import type { CourierRoutes, RouteShape } from "../define/routes";
import { composeBackend, type StreamingFactories } from "../transport/compose-backend";
import { createProxyHTTPExecutor } from "../transport/proxy/http";
import { proxyStreamingFactories } from "../transport/proxy-streaming";
import { sourceFromBoundary } from "./from-boundary";
import { sourceFromRoutes } from "./from-routes";
import { mergeProxyPath, type ProxyPath } from "./proxy-path";
import type { ProxyCallerArguments, ProxyCallerDefaults, ProxyCallerOptions } from "./types";

/**
 * Create a proxy client from the routes of an API, for a page: the module
 * Courier writes them to names which endpoints a browser may call and how
 * each is reached, and is typed from the API it was written from, so the
 * client reaches those endpoints alone and the API's definition never
 * enters the bundle.
 *
 * @param routes - The routes of the API, as the module written for them exports them
 * @param options - Where the proxy is, how long to wait, the credentials and headers to send
 * @returns A client whose groups and endpoints are those the routes name
 * @example
 * ```ts
 * import { apiRoutes } from "./courier.routes";
 *
 * const client = createProxyCaller(apiRoutes);
 * await client.users.getAll();
 * ```
 */
export function createProxyCaller<TApi, TEndpoints extends Readonly<Record<string, RouteShape>>>(
  routes: CourierRoutes<TApi, TEndpoints>,
  options?: ProxyCallerOptions,
): InferClient<RoutedApi<TApi, TEndpoints>>;

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

export function createProxyCaller(
  first: string | CourierRoutes,
  defaults: ProxyCallerDefaults = {},
): unknown {
  const routes = typeof first === "string" ? undefined : first;
  const source = routes ? routes.source : (first as string);
  /* Routes or a boundary are the narrow form of the same thing, and the ones that keep
     the definition out of the browser, so they win where a source is given too. */
  const apiSource = routes
    ? sourceFromRoutes(routes)
    : defaults.boundary
      ? sourceFromBoundary(defaults.boundary)
      : defaults.source;
  // Per-transport merge: caller-level `proxyPath` wins over the source's
  // own `options.proxyPath` on a field-by-field basis. Either side may
  // be partial or undefined; missing transports fall back to built-in
  // defaults inside `resolveProxyPath` at request time.
  const sourceProxyPath = routes
    ? undefined
    : (defaults.boundary?.proxyPath ?? readSourceProxyPath(apiSource));
  const mergedProxyPath = mergeProxyPath(defaults.proxyPath, sourceProxyPath);
  const followed = routes ?? readSourceOptions(apiSource);
  const effectiveDefaults = {
    ...defaults,
    proxyPath: mergedProxyPath,
    cancelPrevious: defaults.cancelPrevious ?? followed?.cancelPrevious,
    coalesce: defaults.coalesce ?? followed?.coalesce,
    routes,
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
    exhaustive: routes ? "routes" : defaults.boundary ? "boundary" : undefined,
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

/** The options a `defineApi` result carries that a proxy client follows. */
interface SourceOptions {
  proxyPath?: ProxyPath;
  cancelPrevious?: readonly string[];
  coalesce?: boolean;
}

/** The options a `defineApi` result carries, read without its generic chain. */
function readSourceOptions(
  apiSource: Record<string, unknown> | undefined,
): SourceOptions | undefined {
  return (apiSource as { options?: SourceOptions } | undefined)?.options;
}
