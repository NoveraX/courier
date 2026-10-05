import type { CallerDefaults } from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";
import { getSourceName } from "@noverax/courier/define";
import {
  createClientRoot,
  createDirectHTTPExecutor,
  directStreamingFactories,
  shapeOfClient,
} from "@noverax/courier/internal";

import { createGroupHooks } from "./group-hooks";
import { groupNodes } from "./group-nodes";
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
export function createQueryCaller<TApi extends DefinedApi>(
  api: TApi,
  defaults?: QueryCallerDefaults,
): QueryCallerClient<TApi> {
  const sourceName = getSourceName(api) ?? "_";
  const httpExecutor = createDirectHTTPExecutor(api, defaults);
  /* Their client code is loaded on the first subscription or channel, so an
     application that opens none does not carry it. */
  const streaming = directStreamingFactories(api, { headers: defaults?.headers, ws: defaults?.ws });

  const subscribeFn: SubscribeFn = (group, method, variables) =>
    streaming.sse(group, method, variables, {});

  const channelFn: ChannelFn = (group, method, variables) =>
    streaming.wsChannel(group, method, variables, {});

  const shape = shapeOfClient({ source: api });
  return createClientRoot(
    shape,
    groupNodes(
      (group) => createGroupHooks(sourceName, group, httpExecutor, subscribeFn, channelFn),
      shape,
    ),
  ) as QueryCallerClient<TApi>;
}
