import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import type { CallerWSOptions } from "../../realtime/ws/ws-types";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
import { instrumentWSChannel, instrumentWSPush } from "../instrument";
import type { WSChannelFactory, WSPushFactory } from "../types";
import { assertDirectlyReachable } from "./assert-reachable";
import { channelAddress } from "./channel-address";

/** What a direct caller says about the sockets its channels open. */
export interface DirectWSDefaults {
  /** Options of the socket the channels share, from the caller's `ws` */
  ws?: CallerWSOptions;
}

/**
 * Create a direct-mode bidirectional WS channel factory.
 *
 * URL pattern: `{baseURL with ws:// scheme}/{groupPrefix}/{path}`, where the
 * path is worked out from each call's variables.
 * Topic pattern: `{sourceName}.{group}.{method}` (multiplexed on shared connection)
 *
 * A channel this process serves with `.implement()` has no address at
 * `baseURL`, so connecting one throws `DIRECT_CALL_TO_SERVED_ENDPOINT`.
 *
 * Browser-side studio instrumentation: when studio hooks are installed,
 * each channel emits stream:open / stream:message / stream:close / stream:error
 * with `mode: "direct"`.
 */
export function createDirectWSChannelFactory(
  api: AnyDefinedApi,
  defaults: DirectWSDefaults = {},
): WSChannelFactory {
  const sourceName = getSourceName(api) ?? "_";

  return function connectChannel(group, method, variables) {
    assertDirectlyReachable(api, group, method);
    const { url, topic } = channelAddress(api, group, method, variables);
    return instrumentWSChannel(executeWSChannel(url, topic, variables, defaults.ws), {
      source: sourceName,
      group,
      method,
      transport: "ws",
      mode: "direct",
    });
  };
}

/**
 * Create a direct-mode server-push WS factory.
 *
 * URL pattern: same as the channel factory.
 * Topic pattern: same as the channel factory.
 *
 * Returns an `SSESubscription`-shaped iterable so push WS endpoints have
 * uniform consumer ergonomics with SSE endpoints. A push channel this
 * process serves throws `DIRECT_CALL_TO_SERVED_ENDPOINT`, as a channel does.
 */
export function createDirectWSPushFactory(
  api: AnyDefinedApi,
  defaults: DirectWSDefaults = {},
): WSPushFactory {
  const sourceName = getSourceName(api) ?? "_";

  return function connectPush(group, method, variables) {
    assertDirectlyReachable(api, group, method);
    const { url, topic } = channelAddress(api, group, method, variables);
    return instrumentWSPush(executeWSPush(url, topic, variables, defaults.ws), {
      source: sourceName,
      group,
      method,
      transport: "ws",
      mode: "direct",
    });
  };
}
