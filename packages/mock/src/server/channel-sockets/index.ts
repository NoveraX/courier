/**
 * The mock's channel sockets, served as a Courier server serves them: on
 * the proxy's WebSocket route, `/api/ws`, where one socket carries every
 * channel a proxy caller subscribes to, each by topic — and on a channel's
 * own path, where a direct caller connects. Either way each subscription is
 * checked, keyed and logged alike, its mock found in the scenario it is
 * made in, and called with the headers a Courier server's hooks would read.
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { logger } from "@noverax/courier";
import type { WSMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket, WebSocketServer } from "ws";
import { parseMessage } from "../ws-handler/parse-message";
import { generateConnectionId } from "../ws-handler/protocol";
import { keepAlive } from "../ws-keep-alive";
import { takeAuthFrame } from "./credentials";
import { sendFrame } from "./frames";
import { handleMessage, handleUnsubscribe } from "./message";
import { handleSubscribe, PROXY_WS_PATH } from "./subscribe";
import { leaveSubscription } from "./subscription";
import type { ChannelRoute, ChannelSocket, ChannelSocketConfig } from "./types";

export { PROXY_WS_PATH } from "./subscribe";
export type { ChannelRoute, ChannelSocketConfig } from "./types";

/** An HTTP upgrade request, as the server's `upgrade` event hands it over */
export interface UpgradeRequest {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}

/** What a socket is opened with */
export interface SocketOpening {
  /** The upgrade request's headers */
  readonly headers: Headers;
  /** The path it was opened on */
  readonly path: string;
  /** The channel it serves, when it was opened on that channel's own path */
  readonly route?: ChannelRoute | undefined;
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
  config: ChannelSocketConfig,
): void {
  const headers = headersOf(upgrade.req);
  wss.handleUpgrade(upgrade.req, upgrade.socket, upgrade.head, (ws) =>
    activateChannelSocket(ws, config, { headers, path: PROXY_WS_PATH }),
  );
}

/**
 * Serve a channel socket: its subscriptions, its messages, its `auth`
 * frames, and every subscription's end when it closes.
 *
 * @param ws - The socket
 * @param config - What its subscriptions are served from
 * @param opening - Its headers, its path, and the channel it serves when it has its own
 * @example
 * ```ts
 * wss.handleUpgrade(req, socket, head, (ws) => activateChannelSocket(ws, config, { headers, path }));
 * ```
 */
export function activateChannelSocket(
  ws: NodeWebSocket,
  config: ChannelSocketConfig,
  opening: SocketOpening,
): void {
  const socket: ChannelSocket = {
    ws,
    config,
    path: opening.path,
    route: opening.route,
    handshake: opening.headers,
    headers: opening.headers,
    id: generateConnectionId(),
    opened: 0,
    subscriptions: new Map(),
    opening: new Map(),
    leaving: new Map(),
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

/* A mock asks for no credentials: an `auth` frame only gives the mocks the headers it carries. */
function route(socket: ChannelSocket, message: WSMessage): void {
  const failed = (error: unknown) =>
    logger.warn("MockWS", `A "${message.type}" frame could not be handled (${socket.id})`, error);
  if (message.type === "ping") sendFrame(socket.ws, { type: "pong" });
  else if (message.type === "auth") takeAuthFrame(socket, message);
  else if (message.type === "subscribe") void handleSubscribe(socket, message).catch(failed);
  else if (message.type === "unsubscribe") void handleUnsubscribe(socket, message).catch(failed);
  else if (message.type === "message") void handleMessage(socket, message).catch(failed);
}

/**
 * The upgrade request's headers, which a channel's mock is called with.
 *
 * @param req - The upgrade request
 * @returns Its headers
 * @example
 * ```ts
 * activateChannelSocket(ws, config, { headers: headersOf(req), path });
 * ```
 */
export function headersOf(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else for (const item of value ?? []) headers.append(name, item);
  }
  return headers;
}
