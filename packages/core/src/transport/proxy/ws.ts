import type { ProxyPath } from "../../proxy-caller/proxy-path";
import type { ResolveOrigin } from "../../proxy-caller/resolve-path";
import { resolveProxyPath } from "../../proxy-caller/resolve-path";
import { socketOptions } from "../../realtime/ws/ws-credentials";
import type { CallerWSOptions, WSConnectionConfig } from "../../realtime/ws/ws-types";
import { buildWSTopic } from "../../realtime/ws-address";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
import { PLAYGROUND_RID_PARAM } from "../../studio/studio-request-id";
import type { WSChannelFactory, WSPushFactory } from "../types";

export interface ProxyWSDefaults {
  /**
   * Per-transport proxy endpoint configuration. Only the `ws` field is
   * read here. There is no built-in default for WS — invoking a WS
   * endpoint without `proxyPath.ws` throws `ConfigurationError` with code
   * `WS_PATH_NOT_CONFIGURED`. The factory itself does not validate at
   * construction time so it can be created in SSR contexts; resolution
   * happens lazily on each `connect{Channel,Push}` call.
   */
  proxyPath?: ProxyPath | undefined;
  /**
   * Optional explicit origin (`{ protocol, host }`) used when resolving
   * relative `proxyPath.ws` values. Required in Node contexts where
   * `globalThis.location` is undefined — e.g. the Studio Playground proxy
   * executor running inside the user-app process. Browser callers can
   * leave this undefined; `resolveProxyPath` falls back to `location`.
   */
  origin?: ResolveOrigin | undefined;
  /**
   * Pre-allocated requestId from Studio Playground. When set, the factory
   * appends `?_playground_rid=<id>` to the resolved WS URL so the server
   * side can use it as the per-subscription Studio requestId, correlating
   * `stream:*` events back to the playground tab that initiated this
   * Subscribe.
   *
   * **Why a query-string param** — browser `new WebSocket(...)` does NOT
   * support arbitrary HTTP headers in the upgrade handshake (only sub-
   * protocols), so the conventional `x-courier-*` header trick used for SSE
   * is unavailable here. Query-string is the only escape hatch the WS
   * protocol gives us, and it survives every reverse proxy hop.
   *
   * Production browser callers leave this undefined — only the Studio
   * Playground proxy executor sets it. Server-side `ws-context.ts`
   * extracts it from `request.url` and stores it on the connection
   * context.
   */
  playgroundRequestId?: string | undefined;
  /** Options of the socket the channels share, from the caller's `ws` */
  ws?: CallerWSOptions | undefined;
  /**
   * The caller's `headers`. A browser cannot put them on a WebSocket's
   * handshake, so they go in the socket's first frame, which the proxy reads
   * as the handshake's own — through `allowedHeaders` to the channel's
   * upstream, as a call's headers go.
   */
  headers?: Record<string, string> | undefined;
}

const optionsOf = new WeakMap<ProxyWSDefaults, Partial<WSConnectionConfig> | undefined>();

/* One set of options for the caller's channels and push subscriptions alike, so they share a socket. */
function proxySocketOptions(defaults: ProxyWSDefaults): Partial<WSConnectionConfig> | undefined {
  if (!optionsOf.has(defaults)) {
    const { headers } = defaults;
    optionsOf.set(defaults, socketOptions(defaults.ws, headers && (() => headers)));
  }
  return optionsOf.get(defaults);
}

/**
 * Append `_playground_rid=<id>` to the resolved WS URL so the server-side
 * `ws-context.ts:buildContext` can extract it via `URL.searchParams` and
 * use it as the per-subscription Studio requestId.
 *
 * Returns the URL unchanged when `playgroundRequestId` is undefined — the
 * production WS path never carries this query param.
 */
function withPlaygroundRid(url: string, playgroundRequestId: string | undefined): string {
  if (!playgroundRequestId) return url;
  // ws:// / wss:// URLs are valid inputs for `new URL(...)`, so we can use
  // it to safely merge query params without manual `?` / `&` juggling.
  const u = new URL(url);
  u.searchParams.set(PLAYGROUND_RID_PARAM, playgroundRequestId);
  return u.toString();
}

/**
 * Create a proxy-mode bidirectional WS channel factory.
 *
 * URL pattern: resolved `proxyPath.ws` (single shared connection)
 * Topic pattern: `{source}.{group}.{method}` (multiplexed by server-side handler)
 *
 * Studio instrumentation lives on the server-side WS dispatcher
 * (`handleSubscribe`) — it owns the canonical connectionId and full
 * lifecycle. The browser side intentionally does NOT wrap with
 * `instrumentWSChannel` to avoid producing a duplicate Timeline entry.
 */
export function createProxyWSChannelFactory(
  source: string,
  defaults: ProxyWSDefaults = {},
): WSChannelFactory {
  const { proxyPath, origin, playgroundRequestId } = defaults;

  return function connectChannel(group, method, variables) {
    const wsUrl = withPlaygroundRid(resolveProxyPath("ws", proxyPath, origin), playgroundRequestId);
    const topic = buildWSTopic(source, group, method);
    return executeWSChannel(wsUrl, topic, variables, proxySocketOptions(defaults));
  };
}

/**
 * Create a proxy-mode server-push WS factory.
 *
 * URL pattern: resolved `proxyPath.ws` (single shared connection)
 * Topic pattern: `{source}.{group}.{method}` (multiplexed by server-side handler)
 */
export function createProxyWSPushFactory(
  source: string,
  defaults: ProxyWSDefaults = {},
): WSPushFactory {
  const { proxyPath, origin, playgroundRequestId } = defaults;

  return function connectPush(group, method, variables) {
    const wsUrl = withPlaygroundRid(resolveProxyPath("ws", proxyPath, origin), playgroundRequestId);
    const topic = buildWSTopic(source, group, method);
    return executeWSPush(wsUrl, topic, variables, proxySocketOptions(defaults));
  };
}
