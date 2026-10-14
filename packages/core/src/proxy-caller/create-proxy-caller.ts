import type { InferClient } from "../client";
import { buildClientProxy } from "../client";
import { shapeOfSource } from "../client/shape";
import type { RoutedApi } from "../define/exposed-api";
import type { CourierRoutes, RouteShape } from "../define/routes";
import { composeBackend } from "../transport/compose-backend";
import { createProxyHTTPExecutor } from "../transport/proxy/http";
import { proxyStreamingFactories } from "../transport/proxy-streaming";
import { sourceFromRoutes } from "./from-routes";
import { proxyDefaultsOf } from "./proxy-defaults";
import type { ProxyCallerOptions } from "./types";

/**
 * Create a page's client of an API, which calls it through the app's proxy
 * routes: the routes module Courier writes from the endpoints marked
 * `.expose()` names which endpoints the page may call and how it reaches
 * each, and is typed from the API it was written from. The client reaches
 * those endpoints alone, and the API's definition — its upstream address,
 * its middleware, its other endpoints — never enters the page's bundle.
 *
 * @param routes - The routes of the API, as the routes module exports them
 * @param options - Where the proxy is, how long to wait, the credentials and headers to send
 * @returns A client whose groups and endpoints are those the routes name
 * @example
 * ```ts
 * import { apiRoutes } from "./courier.routes";
 *
 * const client = createProxyCaller(apiRoutes, {
 *   proxyPath: { http: "/api/request", sse: "/api/sse", ws: "wss://realtime.example.com" },
 * });
 *
 * // Grouped: client.users.getAll()
 * // Flat:    client.getFinances()
 *
 * // .raw and .with() — for every call, a group's, or one endpoint's:
 * await client.raw.users.getById({ id: 1 });
 * await client.with({ timeout: 5000 }).users.getAll();
 * await client.users.raw.getById({ id: 1 });
 * await client.getFinances.with({ timeout: 5000 })();
 * ```
 */
export function createProxyCaller<TApi, TEndpoints extends Readonly<Record<string, RouteShape>>>(
  routes: CourierRoutes<TApi, TEndpoints>,
  options?: ProxyCallerOptions,
): InferClient<RoutedApi<TApi, TEndpoints>>;

export function createProxyCaller(
  routes: CourierRoutes,
  options: ProxyCallerOptions = {},
): unknown {
  const { source } = routes;
  const standIn = sourceFromRoutes(routes);
  const http = createProxyHTTPExecutor(source, proxyDefaultsOf(routes, options));

  /* Streams and channels are told apart by the routes. Their client code is
     loaded on the first stream or channel, so an application that makes
     none does not carry it, and their proxy paths are resolved on the first
     call, so a missing `proxyPath.ws` is reported there. A socket carries
     the client's headers in its first frame, which the proxy reads as its
     handshake's: a browser WebSocket cannot send headers on its upgrade. */
  const streaming = proxyStreamingFactories(source, {
    sse: {
      proxyPath: options.proxyPath,
      headers: options.headers,
      credentials: options.credentials,
    },
    ws: { proxyPath: options.proxyPath, ws: options.ws, headers: options.headers },
  });

  const backend = composeBackend(standIn, http, streaming, { exhaustive: true });
  return buildClientProxy(backend, {}, false, shapeOfSource(standIn));
}
