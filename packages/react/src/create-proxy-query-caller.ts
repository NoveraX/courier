"use client";

import {
  createProxyHTTPExecutor,
  createProxySSEFactory,
  createProxyWSChannelFactory,
  mergeProxyPath,
  type ProxyCallerDefaults,
  type ProxyPath,
} from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";

import { createGroupHooks } from "./group-hooks";
import type { ChannelFn } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import type { QueryCallerClient, QueryGroupClient } from "./types";

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
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (boundary, proxyPath, timeout, credentials, etc.)
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
export function createProxyQueryCaller<TApi extends DefinedApi<any>>(
  source: string,
  defaults?: ProxyCallerDefaults,
): QueryCallerClient<TApi> {
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
  });

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    sseFactory(group, method, variables, {});

  const channelFn: ChannelFn = (group, method, variables) =>
    wsChannelFactory(group, method, variables, {});

  // biome-ignore lint/suspicious/noExplicitAny: cache stores untyped group hooks — typed via QueryCallerClient<TApi> proxy cast
  const groupCache = new Map<string, QueryGroupClient<any>>();

  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof") {
        return undefined;
      }

      const key = prop as string;
      if (!groupCache.has(key)) {
        groupCache.set(key, createGroupHooks(source, key, httpExecutor, subscribeFn, channelFn));
      }
      return groupCache.get(key);
    },
  }) as QueryCallerClient<TApi>;
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
