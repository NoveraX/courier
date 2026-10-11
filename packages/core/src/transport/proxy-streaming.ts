import { assertNoProxyTransport } from "../proxy-caller/assert-no-transport";
import { resolveProxyPath } from "../proxy-caller/resolve-path";
import { buildProxySSEUrl } from "../realtime/sse-address";
import type { StreamingFactories } from "./compose-backend";
import { lazySSEFactory, lazyWSChannelFactory } from "./lazy-streams";
import type { ProxySSEDefaults } from "./proxy/sse";
import type { ProxyWSDefaults } from "./proxy/ws";

/**
 * The stream and channel factories of a proxy client. Their client code is
 * loaded on the first stream or channel, so an application that opens none
 * does not carry it; a proxy path that cannot be resolved, variables that
 * cannot be sent, or a transport the server's own decides, still refuse the
 * call where it is made.
 *
 * @param source - The source's name, as the server's adapters serve it
 * @param defaults - What the SSE factory and the WS factories are made with
 * @returns The SSE, WS channel and WS push factories
 * @example
 * ```ts
 * const streaming = proxyStreamingFactories("api", { sse: { proxyPath }, ws: { proxyPath } });
 * const feed = streaming.sse("chat", "feed", { room: "lobby" }, {});
 * ```
 */
export function proxyStreamingFactories(
  source: string,
  defaults: { sse: ProxySSEDefaults; ws: ProxyWSDefaults },
): Required<StreamingFactories> {
  const { sse, ws } = defaults;
  const streamRefused = (
    group: string,
    method: string,
    variables: unknown,
    options: Readonly<Record<string, unknown>>,
  ): void => {
    assertNoProxyTransport(options);
    buildProxySSEUrl(
      resolveProxyPath("sse", sse.proxyPath, sse.origin),
      source,
      group,
      method,
      variables,
    );
  };
  const channelRefused = (
    _group: string,
    _method: string,
    _variables: unknown,
    options: Readonly<Record<string, unknown>>,
  ): void => {
    assertNoProxyTransport(options);
    resolveProxyPath("ws", ws.proxyPath, ws.origin);
  };
  return {
    sse: lazySSEFactory(
      async () => (await import("./proxy/sse")).createProxySSEFactory(source, sse),
      streamRefused,
    ),
    wsChannel: lazyWSChannelFactory(
      async () => (await import("./proxy/ws")).createProxyWSChannelFactory(source, ws),
      channelRefused,
    ),
    wsPush: lazySSEFactory(
      async () => (await import("./proxy/ws")).createProxyWSPushFactory(source, ws),
      channelRefused,
    ),
  };
}
