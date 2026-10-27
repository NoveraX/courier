import type { ProxyCallerOptions } from "@noverax/courier";
import type { CourierRoutes, DefinedApi, RoutedApi, RouteShape } from "@noverax/courier/define";
import {
  createClientRoot,
  createProxyHTTPExecutor,
  proxyDefaultsOf,
  proxyStreamingFactories,
  shapeOfRoutes,
} from "@noverax/courier/internal-client";

import { createGroupHooks } from "./group-hooks";
import { groupNodes } from "./group-nodes";
import type { ChannelFn } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import type { QueryCallerClient } from "./types";

/**
 * Create a page's React Query client of an API, which calls it through the
 * app's proxy routes: the routes module Courier writes from the endpoints
 * marked `.expose()` names which endpoints the page may call and how it
 * reaches each, and is typed from the API it was written from, so the hooks
 * offer those endpoints alone and the API's definition never enters the
 * bundle. For an app whose browser calls the API itself, without a proxy,
 * use `createQueryCaller(api)`.
 *
 * @param routes - The routes of the API, as the routes module exports them
 * @param options - Where the proxy is, how long to wait, the credentials and headers to send
 * @returns A client with each group's hooks under its name
 * @example
 * ```ts
 * import { apiRoutes } from "./courier.routes";
 *
 * const q = createProxyQueryCaller(apiRoutes);
 *
 * // In components:
 * const { data } = q.users.useQuery("getAll");
 * const { data: user } = q.users.useQuery("getById", { variables: { id: 1 } });
 * const create = q.users.useMutation("create");
 *
 * // A stream's events, and a group's hooks taken apart:
 * const { data: event, status } = q.notifications.useSubscription("feed");
 * const { useQuery } = q.users;
 *
 * // A server render's prefetch:
 * await q.users.prefetchQuery(queryClient, "getAll");
 * ```
 */
export function createProxyQueryCaller<
  TApi extends DefinedApi,
  TEndpoints extends Readonly<Record<string, RouteShape>>,
>(
  routes: CourierRoutes<TApi, TEndpoints>,
  options?: ProxyCallerOptions,
): QueryCallerClient<RoutedApi<TApi, TEndpoints>>;

export function createProxyQueryCaller(
  routes: CourierRoutes,
  options: ProxyCallerOptions = {},
): unknown {
  const { source } = routes;
  const httpExecutor = createProxyHTTPExecutor(source, proxyDefaultsOf(routes, options));
  /* Their client code is loaded on the first subscription or channel, so an
     application that opens none does not carry it. A missing `proxyPath.ws`
     is reported on the first `useChannel`. A socket carries the client's
     headers in its first frame, which the proxy reads as its handshake's: a
     browser WebSocket cannot send headers on its upgrade. */
  const streaming = proxyStreamingFactories(source, {
    sse: {
      proxyPath: options.proxyPath,
      headers: options.headers,
      credentials: options.credentials,
    },
    ws: { proxyPath: options.proxyPath, ws: options.ws, headers: options.headers },
  });

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    streaming.sse(group, method, variables, {});

  const channelFn: ChannelFn = (group, method, variables) =>
    streaming.wsChannel(group, method, variables, {});

  /* A group named like a hook the runtime reads, such as `then`, is reached
     as the routes name it. */
  const shape = shapeOfRoutes(routes);
  return createClientRoot(
    shape,
    groupNodes(
      (group) => createGroupHooks(source, group, httpExecutor, subscribeFn, channelFn),
      shape,
    ),
  );
}
