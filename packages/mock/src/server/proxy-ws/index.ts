/**
 * The mock's stand-in for a Courier proxy's WebSocket route, `/api/ws`: one
 * socket carries every channel a proxy caller subscribes to, each by topic,
 * as a Courier server serves them — so a proxy caller pointed at the mock
 * with `proxyPath.ws` reaches its channels there.
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { logger } from "@noverax/courier";
import type { WSMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket, WebSocketServer } from "ws";
import { parseMessage } from "../ws-handler/message-router";
import { generateConnectionId } from "../ws-handler/protocol";
import { keepAlive } from "../ws-keep-alive";
import { sendFrame } from "./frames";
import { handleMessage, handleUnsubscribe } from "./message";
import { handleSubscribe } from "./subscribe";
import { leaveSubscription } from "./subscription";
import type { ProxySocket, ProxyWSConfig } from "./types";

export { PROXY_WS_PATH } from "./subscribe";
export type { ProxyWSConfig } from "./types";

/** An HTTP upgrade request, as the server's `upgrade` event hands it over */
export interface UpgradeRequest {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}

/**
 * Upgrade a request on the proxy's WebSocket route, and serve the socket.
 *
 * @param wss - The WebSocket server that upgrades it
 * @param upgrade - The request
 * @param config - What its subscriptions are served from
 * @example
 * ```ts
 * nodeServer.on("upgrade", (req, socket, head) => acceptProxySocket(wss, { req, socket, head }, config));
 * ```
 */
export function acceptProxySocket(
  wss: WebSocketServer,
  upgrade: UpgradeRequest,
  config: ProxyWSConfig,
): void {
  const headers = headersOf(upgrade.req);
  wss.handleUpgrade(upgrade.req, upgrade.socket, upgrade.head, (ws) =>
    activateProxySocket(ws, config, headers),
  );
}

/**
 * Serve a socket upgraded on the proxy's WebSocket route.
 *
 * @param ws - The socket
 * @param config - What its subscriptions are served from
 * @param headers - The upgrade request's headers
 * @example
 * ```ts
 * wss.handleUpgrade(req, socket, head, (ws) => activateProxySocket(ws, config, headersOf(req)));
 * ```
 */
export function activateProxySocket(
  ws: NodeWebSocket,
  config: ProxyWSConfig,
  headers: Headers,
): void {
  const socket: ProxySocket = {
    ws,
    config,
    headers,
    id: generateConnectionId(),
    opened: 0,
    subscriptions: new Map(),
    opening: new Map(),
  };
  const alive = keepAlive(ws, config.heartbeat);
  ws.on("message", (raw: Buffer | string) => {
    const message = parseMessage(ws, raw);
    if (message?.type === "pong") alive.receivedPong();
    else if (message) route(socket, message);
  });
  ws.on("close", () => {
    for (const [topic, subscription] of [...socket.subscriptions]) {
      void leaveSubscription(socket, topic, subscription);
    }
  });
  ws.on("error", (error: Error) => logger.warn("MockWS", `Connection error (${socket.id})`, error));
}

/* A mock asks for no credentials, so an `auth` frame has nothing to answer. */
function route(socket: ProxySocket, message: WSMessage): void {
  const failed = (error: unknown) =>
    logger.warn("MockWS", `A "${message.type}" frame could not be handled (${socket.id})`, error);
  if (message.type === "ping") sendFrame(socket.ws, { type: "pong" });
  else if (message.type === "subscribe") void handleSubscribe(socket, message).catch(failed);
  else if (message.type === "unsubscribe") void handleUnsubscribe(socket, message).catch(failed);
  else if (message.type === "message") void handleMessage(socket, message).catch(failed);
}

/* The upgrade request's headers, which a channel's mock is called with. */
function headersOf(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else for (const item of value ?? []) headers.append(name, item);
  }
  return headers;
}
