import type { ProxyCallerArguments, ProxyCallerDefaults, ProxyPath } from "@noverax/courier";
import type { BrowserApi, DefinedApi } from "@noverax/courier/define";
import {
  createClientRoot,
  createProxyHTTPExecutor,
  createProxySSEFactory,
  createProxyWSChannelFactory,
  mergeProxyPath,
  shapeOfClient,
} from "@noverax/courier/internal";

import { cachedGroupHooks } from "./cached-group-hooks";
import { createGroupHooks } from "./group-hooks";
import type { ChannelFn } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import type { QueryCallerClient } from "./types";

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

export function createProxyQueryCaller(source: string, defaults?: ProxyCallerDefaults): unknown {
  // Per-transport merge: caller-level `proxyPath` wins over the source's
  // own `options.proxyPath` on a field-by-field basis. Forwarding the merged
  // value into every factory keeps `useQuery` / `useSubscription` /
  // `useChannel` consistent with `createProxyCaller`.
  const sourceProxyPath = readDefaultsSourceProxyPath(defaults);
  const mergedProxyPath = mergeProxyPath(defaults?.proxyPath, sourceProxyPath);
  const effectiveDefaults: ProxyCallerDefaults = {
    ...defaults,
    proxyPath: mergedProxyPath,
  };

  const httpExecutor = createProxyHTTPExecutor(source, effectiveDefaults);
  const sseFactory = createProxySSEFactory(source, {
    proxyPath: mergedProxyPath,
    headers: defaults?.headers,
  });

  // WS channel factory is constructed unconditionally — `resolveProxyPath`
  // is invoked lazily on the first `useChannel` subscribe and surfaces a
  // clear `ConfigurationError` ("WS_PATH_NOT_CONFIGURED") if the user
  // calls `useChannel` without `proxyPath.ws` set.
  // ⚠️ defaults.headers is intentionally NOT forwarded to the WS factory.
  // Browser WebSocket cannot send custom HTTP headers in the upgrade
  // handshake. See `ProxyWSDefaults` for supported auth alternatives.
  const wsChannelFactory = createProxyWSChannelFactory(source, {
    proxyPath: mergedProxyPath,
    ws: defaults?.ws,
  });

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    sseFactory(group, method, variables, {});

  const channelFn: ChannelFn = (group, method, variables) =>
    wsChannelFactory(group, method, variables, {});

  /* A group named like a hook the runtime reads, such as `then`, is reached
     only when the caller was given what the source declares. */
  return createClientRoot(
    shapeOfClient({ source: defaults?.source, boundary: defaults?.boundary }),
    cachedGroupHooks((group) =>
      createGroupHooks(source, group, httpExecutor, subscribeFn, channelFn),
    ),
  );
}

/**
 * Pull `options.proxyPath` from `defaults.source` if the caller passed a
 * `defineApi` result. Lets the merged proxyPath inherit source-level
 * defaults without forcing the caller to restate them.
 */
function readDefaultsSourceProxyPath(
  defaults: ProxyCallerDefaults | undefined,
): ProxyPath | undefined {
  /* A boundary carries the app's own proxy paths and nothing about the
     server, so it is the one to prefer where both were given. These hooks
     never needed the source itself: `useQuery`, `useSubscription` and
     `useChannel` each name their transport, so nothing is detected here. */
  if (defaults?.boundary?.proxyPath) return defaults.boundary.proxyPath;

  const apiSource = defaults?.source as { options?: { proxyPath?: ProxyPath } } | undefined;
  return apiSource?.options?.proxyPath;
}
