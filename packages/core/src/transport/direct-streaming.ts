import type { AnyDefinedApi } from "../define";
import type { CallerWSOptions } from "../realtime/ws/ws-types";
import type { StreamingFactories } from "./compose-backend";
import { assertDirectlyReachable } from "./direct/assert-reachable";
import { channelAddress } from "./direct/channel-address";
import { streamRequest } from "./direct/stream-request";
import { lazySSEFactory, lazyWSChannelFactory } from "./lazy-streams";

/**
 * The stream and channel factories of a direct client. Their client code is
 * loaded on the first stream or channel, so an application that opens none
 * does not carry it; what refuses a call — an endpoint this process serves,
 * variables its path cannot be filled from — still does so where it is made.
 *
 * @param source - The API the client calls
 * @param defaults - The headers every stream sends, and how channels' sockets behave
 * @returns The SSE, WS channel and WS push factories
 * @example
 * ```ts
 * const streaming = directStreamingFactories(api, { headers: { authorization } });
 * const feed = streaming.sse("chat", "feed", { room: "lobby" }, {});
 * ```
 */
export function directStreamingFactories(
  source: AnyDefinedApi,
  defaults: { headers?: Record<string, string> | undefined; ws?: CallerWSOptions | undefined },
): Required<StreamingFactories> {
  const streamRefused = (group: string, method: string, variables: unknown): void => {
    assertDirectlyReachable(source, group, method);
    streamRequest(source, group, method, variables);
  };
  const channelRefused = (group: string, method: string, variables: unknown): void => {
    assertDirectlyReachable(source, group, method);
    channelAddress(source, group, method, variables);
  };
  const { headers, ws } = defaults;
  return {
    sse: lazySSEFactory(
      async () => (await import("./direct/sse")).createDirectSSEFactory(source, { headers }),
      streamRefused,
    ),
    wsChannel: lazyWSChannelFactory(
      async () => (await import("./direct/ws")).createDirectWSChannelFactory(source, { ws }),
      channelRefused,
    ),
    wsPush: lazySSEFactory(
      async () => (await import("./direct/ws")).createDirectWSPushFactory(source, { ws }),
      channelRefused,
    ),
  };
}
