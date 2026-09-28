import {
  type CallerDefaults,
  createClientRoot,
  createDirectHTTPExecutor,
  createDirectSSEFactory,
  createDirectWSChannelFactory,
  shapeOfClient,
} from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";
import { getSourceName } from "@noverax/courier/define";

import { cachedGroupHooks } from "./cached-group-hooks";
import { createGroupHooks } from "./group-hooks";
import type { ChannelFn } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import type { QueryCallerClient } from "./types";

/**
 * Defaults for direct-mode `createQueryCaller`.
 *
 * Identical to core `CallerDefaults` — no proxy-specific fields (no `proxyPath`,
 * no `credentials`). Direct mode connects straight to the backend defined by
 * `api.options.baseURL`.
 */
export type QueryCallerDefaults = CallerDefaults;

/**
 * Create a direct-mode query client with dot-notation access to react-query hooks per API group.
 *
 * Direct mode connects straight to the backend defined by `api.options.baseURL`
 * — no server-side proxy adapter required. Use for SPAs, React Native, internal
 * tools, or any context where you ship the API definition to the client.
 *
 * For proxy mode (browser → server adapter → backend), use `createProxyQueryCaller<T>("name")` instead.
 *
 * @param api - The API definition created with `defineApi()`
 * @param defaults - Caller configuration (timeout, headers, context, error handlers)
 *
 * @example
 * ```ts
 * import { createQueryCaller } from "@noverax/courier-react";
 * import { api } from "@/shared/api";
 *
 * export const q = createQueryCaller(api, { timeout: 10_000 });
 *
 * // In components:
 * const { data } = q.users.useQuery("getAll");
 * const { data } = q.users.useQuery("getById", { variables: { id: 1 } });
 * const mutation = q.users.useMutation("create");
 *
 * // SSE subscription:
 * const { data, status } = q.notifications.useSubscription("feed");
 *
 * // WS bidirectional channel:
 * const { send, lastMessage } = q.chat.useChannel("room", { variables: { roomId: "1" } });
 *
 * // SSR prefetch:
 * await q.users.prefetchQuery(queryClient, "getAll");
 * ```
 */
export function createQueryCaller<TApi extends DefinedApi<any>>(
  api: TApi,
  defaults?: QueryCallerDefaults,
): QueryCallerClient<TApi> {
  const sourceName = getSourceName(api) ?? "_";
  const httpExecutor = createDirectHTTPExecutor(api, defaults);
  const sseFactory = createDirectSSEFactory(api, { headers: defaults?.headers });
  const wsChannelFactory = createDirectWSChannelFactory(api);

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    sseFactory(group, method, variables, {});

  // Direct dot-notation maps `.useChannel(...)` to the bidirectional WS factory.
  // No runtime cast needed — `createDirectWSChannelFactory` returns `WSChannel`
  // which matches `ChannelFn`'s return type at compile time.
  const channelFn: ChannelFn = (group, method, variables) =>
    wsChannelFactory(group, method, variables, {});

  return createClientRoot(
    shapeOfClient({ source: api }),
    cachedGroupHooks((group) =>
      createGroupHooks(sourceName, group, httpExecutor, subscribeFn, channelFn),
    ),
  ) as QueryCallerClient<TApi>;
}
