import type {
  ProxyCallerArguments,
  ProxyCallerDefaults,
  ProxyCallerOptions,
} from "@noverax/courier";
import type {
  BrowserApi,
  CourierRoutes,
  DefinedApi,
  RoutedApi,
  RouteShape,
} from "@noverax/courier/define";
import {
  createClientRoot,
  createProxyHTTPExecutor,
  proxyStreamingFactories,
  shapeOfClient,
} from "@noverax/courier/internal";

import { createGroupHooks } from "./group-hooks";
import { groupNodes } from "./group-nodes";
import type { ChannelFn } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import { proxyQueryConfig } from "./proxy-query-config";
import type { QueryCallerClient } from "./types";

/**
 * Create a proxy-mode query client from the routes of an API, for a page:
 * the module Courier writes them to names which endpoints a browser may
 * call and how each is reached, and is typed from the API it was written
 * from, so the hooks offer those endpoints alone and the API's definition
 * never enters the bundle.
 *
 * @param routes - The routes of the API, as the module written for them exports them
 * @param options - Where the proxy is, how long to wait, the credentials and headers to send
 * @returns A client with each group's hooks under its name
 * @example
 * ```ts
 * import { apiRoutes } from "./courier.routes";
 *
 * const q = createProxyQueryCaller(apiRoutes);
 * const { data } = q.users.useQuery("getAll");
 * ```
 */
export function createProxyQueryCaller<
  TApi extends DefinedApi,
  TEndpoints extends Readonly<Record<string, RouteShape>>,
>(
  routes: CourierRoutes<TApi, TEndpoints>,
  options?: ProxyCallerOptions,
): QueryCallerClient<RoutedApi<TApi, TEndpoints>>;

/**
 * Create a proxy-mode query client typed from the API it is given as
 * `source`, for code that runs where the definition may be — a server
 * render, a test. A browser bundle names the API as a type and passes a
 * `boundary` instead (next overload).
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration, with the API itself as `source`
 * @returns A client with each group's hooks under its name
 * @example
 * ```ts
 * const q = createProxyQueryCaller("api", { source: api });
 * const { data } = q.users.useQuery("getAll");
 * ```
 */
export function createProxyQueryCaller<TApi extends DefinedApi>(
  source: string,
  defaults: ProxyCallerDefaults & { source: TApi },
): QueryCallerClient<BrowserApi<TApi>>;

/**
 * Create a proxy-mode query client with dot-notation access to react-query hooks per API group.
 *
 * Proxy mode routes all requests through the server adapter (apiRoute / sseRoute / WS handler).
 * Use this when the API definition cannot ship to the browser (secrets, bundle size, CORS bypass).
 * For direct mode (browser → backend without proxy), use `createQueryCaller(api)` instead.
 *
 * Pass a `boundary` rather than the API object: these hooks each name their
 * own transport, so nothing is read off the source, and handing it over puts
 * the upstream host, the middleware and every endpoint path in the bundle.
 * An API with streams or channels requires one of the two, as
 * `createProxyCaller` does: the boundary carries the proxy paths its
 * subscriptions and channels open.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (boundary, proxyPath, timeout, credentials, etc.)
 * @returns A client with each group's hooks under its name
 *
 * @example
 * ```ts
 * const q = createProxyQueryCaller<typeof api>("api", { boundary });
 *
 * // In components:
 * const { data } = q.users.useQuery("getAll");
 * const { data } = q.users.useQuery("getById", { variables: { id: 1 } });
 * const mutation = q.users.useMutation("create");
 *
 * // SSE subscription:
 * const { data, status } = q.notifications.useSubscription("feed");
 *
 * // Destructuring works:
 * const { useQuery, useMutation } = q.users;
 * const { data } = useQuery("getAll");
 *
 * // SSR prefetch:
 * await q.users.prefetchQuery(queryClient, "getAll");
 * ```
 */
export function createProxyQueryCaller<TApi extends DefinedApi>(
  source: string,
  ...defaults: ProxyCallerArguments<TApi>
): QueryCallerClient<BrowserApi<TApi>>;

export function createProxyQueryCaller(
  first: string | CourierRoutes,
  given?: ProxyCallerDefaults,
): unknown {
  const { source, routes, defaults } = proxyQueryConfig(first, given);
  const httpExecutor = createProxyHTTPExecutor(source, defaults);
  /* Their client code is loaded on the first subscription or channel, so an
     application that opens none does not carry it. A missing `proxyPath.ws`
     is reported on the first `useChannel`. A socket carries defaults.headers
     in its first frame, which the proxy reads as its handshake's: a browser
     WebSocket cannot send headers on its upgrade. */
  const streaming = proxyStreamingFactories(source, {
    sse: {
      proxyPath: defaults.proxyPath,
      headers: defaults.headers,
      credentials: defaults.credentials,
    },
    ws: { proxyPath: defaults.proxyPath, ws: defaults.ws, headers: defaults.headers },
  });

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    streaming.sse(group, method, variables, {});

  const channelFn: ChannelFn = (group, method, variables) =>
    streaming.wsChannel(group, method, variables, {});

  /* A group named like a hook the runtime reads, such as `then`, is reached
     only when the caller was given what the API declares. */
  const shape = shapeOfClient({ source: defaults.source, boundary: defaults.boundary, routes });
  return createClientRoot(
    shape,
    groupNodes(
      (group) => createGroupHooks(source, group, httpExecutor, subscribeFn, channelFn),
      shape,
    ),
  );
}
