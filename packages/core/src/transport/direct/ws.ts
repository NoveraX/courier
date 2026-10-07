import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
import { instrumentWSChannel, instrumentWSPush } from "../instrument";
import type { WSChannelFactory, WSPushFactory } from "../types";
import { assertDirectlyReachable } from "./assert-reachable";
import { channelAddress } from "./channel-address";
import { type DirectSocketDefaults, directSocketOptions } from "./socket-config";
import { sourceHeadersOf } from "./stream-request";
import { streamSessionOf } from "./stream-session";
import { studioRequestIdOption } from "./studio-request-option";

/**
 * What a direct caller says about the sockets its channels open: its `ws`,
 * and its `headers`. The caller hands the same object to its channel and
 * push factories, so its channels on one URL share a socket.
 */
export type DirectWSDefaults = DirectSocketDefaults;

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
  const sourceHeaders = sourceHeadersOf(api);

  return function connectChannel(group, method, variables, options) {
    assertDirectlyReachable(api, group, method);
    const { url, topic } = channelAddress(api, group, method, variables);
    const socket = directSocketOptions(defaults, sourceHeaders, streamSessionOf(options));
    return instrumentWSChannel(
      executeWSChannel(url, topic, variables, socket),
      { source: sourceName, group, method, transport: "ws", mode: "direct" },
      studioRequestIdOption(options),
    );
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
  const sourceHeaders = sourceHeadersOf(api);

  return function connectPush(group, method, variables, options) {
    assertDirectlyReachable(api, group, method);
    const { url, topic } = channelAddress(api, group, method, variables);
    const socket = directSocketOptions(defaults, sourceHeaders, streamSessionOf(options));
    return instrumentWSPush(
      executeWSPush(url, topic, variables, socket),
      { source: sourceName, group, method, transport: "ws", mode: "direct" },
      studioRequestIdOption(options),
    );
  };
}
