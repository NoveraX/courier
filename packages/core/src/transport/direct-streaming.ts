import type { AnyDefinedApi } from "../define";
import { assertTransportOptions } from "../http-client/assert-transport-options";
import type { RequestContext } from "../http-client/types";
import type { CallerWSOptions } from "../realtime/ws/ws-types";
import type { StreamingFactories } from "./compose-backend";
import { assertDirectlyReachable } from "./direct/assert-reachable";
import { channelAddress } from "./direct/channel-address";
import { streamRequest } from "./direct/stream-request";
import { startStreamSession, withStreamSession } from "./direct/stream-session";
import { lazySSEFactory, lazyWSChannelFactory } from "./lazy-streams";

/**
 * The stream and channel factories of a direct client. Their client code is
 * loaded on the first stream or channel, so an application that opens none
 * does not carry it; what refuses a call — an endpoint this process serves,
 * variables its path cannot be filled from, a transport of its own that
 * cannot send — still does so where it is made.
 *
 * @param source - The API the client calls
 * @param defaults - The headers every stream sends, how channels' sockets behave, and the
 *   caller's context, which names the request whose session they carry
 * @returns The SSE, WS channel and WS push factories
 * @example
 * ```ts
 * const streaming = directStreamingFactories(api, { headers: { authorization } });
 * const feed = streaming.sse("chat", "feed", { room: "lobby" }, {});
 * ```
 */
export function directStreamingFactories(
  source: AnyDefinedApi,
  defaults: {
    headers?: Record<string, string> | undefined;
    ws?: CallerWSOptions | undefined;
    context?: RequestContext | undefined;
  },
): Required<StreamingFactories> {
  const streamRefused = (group: string, method: string, variables: unknown): void => {
    assertDirectlyReachable(source, group, method);
    streamRequest(source, group, method, variables);
  };
  const channelRefused = (group: string, method: string, variables: unknown): void => {
    assertDirectlyReachable(source, group, method);
    channelAddress(source, group, method, variables);
  };
  const { headers, ws, context } = defaults;
  const sockets = { ws, headers };
  const sse = lazySSEFactory(async () =>
    (await import("./direct/sse")).createDirectSSEFactory(source, { headers }),
  );
  const wsChannel = lazyWSChannelFactory(async () =>
    (await import("./direct/ws")).createDirectWSChannelFactory(source, sockets),
  );
  const wsPush = lazySSEFactory(async () =>
    (await import("./direct/ws")).createDirectWSPushFactory(source, sockets),
  );
  /* Refused first; then the user's session is found as the call is made,
     before the client that opens it is loaded. */
  const opening =
    (check: typeof streamRefused) =>
    (group: string, method: string, variables: unknown, options: Record<string, unknown>) => {
      check(group, method, variables);
      assertTransportOptions(options, "call");
      return withStreamSession(options, startStreamSession(source, group, method, context));
    };
  const streamOptions = opening(streamRefused);
  const channelOptions = opening(channelRefused);
  return {
    sse: (group, method, variables, options) =>
      sse(group, method, variables, streamOptions(group, method, variables, options)),
    wsChannel: (group, method, variables, options) =>
      wsChannel(group, method, variables, channelOptions(group, method, variables, options)),
    wsPush: (group, method, variables, options) =>
      wsPush(group, method, variables, channelOptions(group, method, variables, options)),
  };
}
