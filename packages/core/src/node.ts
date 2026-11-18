import type { IncomingMessage } from "node:http";
import { discoverAppOrigin } from "./discover-app-origin";
import { addressedTo } from "./node-origin";
import { serverOriginOf } from "./socket-origin";

export { DEFAULT_WS_MAX_MESSAGE_SIZE, wsFrameLimit } from "./adapter/ws-frame-limit";
export type { ServerOrigin } from "./discover-app-origin";
export { toWebRequest } from "./node-request";
export {
  nodeIncomingRequest,
  requestContext,
  withIncomingRequest,
} from "./node-request-context";
export { sendWebResponse } from "./node-response";
export {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  type UpgradeServer,
  type WebSocketUpgradeOptions,
} from "./node-websocket";
export { serverOriginOf } from "./socket-origin";
export {
  type WebRequestOptions,
  webIncomingRequest,
  withSetCookies,
  withWebRequestContext,
} from "./web-request-context";

/**
 * Extract a canonical `http(s)://host[:port]` origin from a Node.js
 * `IncomingMessage`: the one its client addressed. A local or private-network
 * proxy's `X-Forwarded-Proto` / `X-Forwarded-Host` are honored, as the
 * request URL honors them; from any other peer they are ignored, so a
 * public caller cannot claim another site's name.
 *
 * Returns `undefined` when the request has no host at all (malformed
 * HTTP/1.0 clients, crafted payloads) so callers can fall back to env
 * vars or leave `appOrigin` unset rather than store a bogus value.
 */
export function extractOriginFromNodeRequest(nodeReq: IncomingMessage): string | undefined {
  const { protocol, host } = addressedTo(nodeReq);
  if (!host) return undefined;
  return `${protocol}://${host}`;
}

/**
 * Learn the app's origin from a Node request, unless one is set: the address
 * and port of the socket the server accepted it on — see `serverOriginOf`
 * and `discoverAppOrigin`. Nothing the request sends decides it.
 *
 * @param nodeReq - The incoming request
 * @example
 * ```ts
 * server.on("request", (req) => discoverNodeAppOrigin(req));
 * ```
 */
export function discoverNodeAppOrigin(nodeReq: IncomingMessage): void {
  discoverAppOrigin(serverOriginOf(nodeReq.socket));
}
