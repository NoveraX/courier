import { logger } from "@noverax/courier";
import {
  type ChannelHandlers,
  decodeMessage,
  encodeMessage,
  type WSMessage,
} from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { WSConnectionRegistry } from "./connection-registry";
import { errMessage, sendError, sendErrorAndClose } from "./protocol";

/** Mutable per-connection state shared between message and close handlers */
export interface ConnectionState {
  subscribed: boolean;
  leaveCalled: boolean;
}

/** Minimal channel context shape used by the message router */
export interface MessageRouterContext {
  topic: string;
  connectionId: string;
}

/** Decode an incoming raw frame to a typed WSMessage, sending an error frame on failure */
export function parseMessage(ws: NodeWebSocket, raw: Buffer | string): WSMessage | null {
  try {
    return decodeMessage(raw.toString());
  } catch {
    sendError(ws, 4400, "Invalid message");
    return null;
  }
}

/**
 * Dispatch a decoded WS message to the user's channel handlers.
 *
 * Implements the Courier mock-server WS protocol subset:
 * - `subscribe` → register in topic registry, fire `onJoin`
 * - `unsubscribe` → fire `onLeave` (idempotent), close 1000
 * - `message` → fire `onMessage` (rejected before subscribe)
 * - `ping` → reply `pong`
 */
export async function dispatchMessage<TChannelCtx extends MessageRouterContext>(
  msg: WSMessage,
  ws: NodeWebSocket,
  handlers: ChannelHandlers<unknown, unknown>,
  channelCtx: TChannelCtx,
  state: ConnectionState,
  registry: WSConnectionRegistry,
): Promise<void> {
  if (msg.type === "subscribe") {
    if (state.subscribed) return;
    state.subscribed = true;
    // Adopt the client's qualified topic — it includes the source name and
    // the variables hash, so multiplexed broadcasts agree on a single key
    // across all peers and the client's topic dispatcher resolves frames
    // we send back to the matching subscriber.
    const clientTopic = msg.topic ?? channelCtx.topic;
    channelCtx.topic = clientTopic;
    registry.register(clientTopic, ws);
    ws.send(encodeMessage({ type: "subscribed", id: msg.id, topic: clientTopic }));
    try {
      await handlers.onJoin?.(channelCtx as never);
    } catch (err) {
      sendErrorAndClose(ws, 5000, errMessage(err, "onJoin failed"), 1011);
    }
    return;
  }

  if (msg.type === "unsubscribe") {
    await callOnLeaveOnce(state, handlers, channelCtx, registry, ws);
    ws.send(encodeMessage({ type: "unsubscribed", id: msg.id, topic: channelCtx.topic }));
    ws.close(1000, "unsubscribed");
    return;
  }

  if (msg.type === "message") {
    if (!state.subscribed) {
      sendError(ws, 4401, "Send `subscribe` before `message`");
      return;
    }
    try {
      await handlers.onMessage?.(channelCtx as never, msg.payload);
    } catch (err) {
      sendError(ws, 5000, errMessage(err, "onMessage failed"));
    }
    return;
  }

  if (msg.type === "ping") {
    ws.send(encodeMessage({ type: "pong" }));
  }
}

/**
 * Run `onLeave` exactly once across all close paths (explicit unsubscribe,
 * socket close, transport error). Unregisters from the broadcast registry.
 */
export async function callOnLeaveOnce<TChannelCtx extends MessageRouterContext>(
  state: ConnectionState,
  handlers: ChannelHandlers<unknown, unknown>,
  channelCtx: TChannelCtx,
  registry: WSConnectionRegistry,
  ws: NodeWebSocket,
): Promise<void> {
  if (!state.subscribed || state.leaveCalled) return;
  state.leaveCalled = true;
  registry.unregister(channelCtx.topic, ws);
  try {
    await handlers.onLeave?.(channelCtx as never);
  } catch (err) {
    logger.warn(
      "MockWS",
      `onLeave threw (${channelCtx.connectionId}): ${errMessage(err, "unknown")}`,
    );
  }
}
