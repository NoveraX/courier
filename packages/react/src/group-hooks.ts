import type { HTTPExecutor } from "@noverax/courier";

import { createGroupCall } from "./group-call";
import type { ChannelFn } from "./hooks/use-channel";
import { useChannel as useChannelHook } from "./hooks/use-channel";
import type { SubscribeFn } from "./hooks/use-subscription";
import { useSubscription as useSubscriptionHook } from "./hooks/use-subscription";
import { createMutationHook } from "./mutation-hook";
import { createQueryHooks } from "./query-hooks";
import type { UntypedGroupHooks } from "./untyped-group-hooks";

/**
 * Build every hook of one API group over the caller's transports.
 *
 * @param source - Source name that starts every query key
 * @param groupName - API group the hooks belong to
 * @param httpExecutor - Direct or proxy HTTP executor
 * @param subscribeFn - Opens a group's SSE stream
 * @param channelFn - Opens a group's WebSocket channel
 * @returns The group's hooks, as they run; a query caller types them for its callers
 * @example
 * const users = createGroupHooks("api", "users", httpExecutor, subscribeFn, channelFn);
 */
export function createGroupHooks(
  source: string,
  groupName: string,
  httpExecutor: HTTPExecutor,
  subscribeFn: SubscribeFn,
  channelFn: ChannelFn,
): UntypedGroupHooks {
  const call = createGroupCall(groupName, httpExecutor);

  return {
    ...createQueryHooks(source, groupName, call, subscribeFn),
    ...createMutationHook(call),

    useSubscription(method: string, options?: Record<string, unknown>) {
      return useSubscriptionHook(subscribeFn, groupName, method, options);
    },

    useChannel(method: string, options?: Record<string, unknown>) {
      return useChannelHook(channelFn, groupName, method, options);
    },
  };
}
