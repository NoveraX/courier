import type { ProxyPath } from "../../proxy-caller/proxy-path";
import type { ResolveOrigin } from "../../proxy-caller/resolve-path";
import { resolveProxyPath } from "../../proxy-caller/resolve-path";
import type { CallerWSOptions } from "../../realtime/ws/ws-types";
import { buildWSTopic } from "../../realtime/ws-address";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
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
  // ⚠️ No `headers` field on purpose. Browser WebSocket (`new WebSocket(...)`)
  // does NOT support arbitrary HTTP headers in the upgrade handshake — only
  // sub-protocols. Adding a `headers` field here would be silently dropped
  // and create exactly the kind of "looks like it works" footgun this
  // package is built to eliminate. For auth, use one of:
  //  • a query-string token in `proxyPath.ws`
  //  • the `protocols` channel via a custom auth scheme
  //  • a first `auth` message sent right after connect (canonical pattern)
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
  u.searchParams.set("_playground_rid", playgroundRequestId);
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
  const { proxyPath, origin, playgroundRequestId, ws } = defaults;

  return function connectChannel(group, method, variables) {
    const wsUrl = withPlaygroundRid(resolveProxyPath("ws", proxyPath, origin), playgroundRequestId);
    const topic = buildWSTopic(source, group, method);
    return executeWSChannel(wsUrl, topic, variables, ws);
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
  const { proxyPath, origin, playgroundRequestId, ws } = defaults;

  return function connectPush(group, method, variables) {
    const wsUrl = withPlaygroundRid(resolveProxyPath("ws", proxyPath, origin), playgroundRequestId);
    const topic = buildWSTopic(source, group, method);
    return executeWSPush(wsUrl, topic, variables, ws);
  };
}
