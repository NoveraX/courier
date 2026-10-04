import { logger } from "@noverax/courier";
import {
  decodeMessage,
  describeFailure,
  encodeMessage,
  type WSMessage,
} from "@noverax/courier/internal";
import type { ChannelHandlers, WSChannelContext } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { WSConnectionRegistry } from "./connection-registry";
import { endSubscriptionAndClose, sendError } from "./protocol";

/** Mutable per-connection state shared between message and close handlers */
export interface ConnectionState {
  subscribed: boolean;
  leaveCalled: boolean;
  /** Fires when the subscription ends; handed to the handlers as `ctx.signal` */
  ended: AbortController;
}

/**
 * A channel's context as the router drives it: the context its handlers
 * receive, with a topic the router sets to the one the client subscribed
 * under.
 */
export interface MessageRouterContext extends WSChannelContext {
  topic: string;
}

/** Decode an incoming raw frame to a typed WSMessage, sending an error frame on failure */
export function parseMessage(ws: NodeWebSocket, raw: Buffer | string): WSMessage | null {
  try {
    return decodeMessage(raw.toString());
  } catch (error) {
    logger.warn("MockWS", "Undecodable frame", error);
    sendError(ws, { code: 4400, message: "Invalid message" });
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
export async function dispatchMessage(
  msg: WSMessage,
  ws: NodeWebSocket,
  handlers: ChannelHandlers<unknown, unknown>,
  channelCtx: MessageRouterContext,
  state: ConnectionState,
  registry: WSConnectionRegistry,
): Promise<void> {
  if (msg.type === "subscribe") {
    if (state.subscribed) return;
    state.subscribed = true;
    // Adopt the client's qualified topic — the source name, then the
    // variables as canonical JSON after `#` — so broadcasts agree on one key
    // across peers with equal variables, and the client's topic dispatcher
    // resolves the frames sent back to the matching subscriber. A channel
    // reached at its declared path is a `.connect()` channel, which core
    // refuses a `.topic()` key, so the variables alone name its topic.
    const clientTopic = msg.topic ?? channelCtx.topic;
    channelCtx.topic = clientTopic;
    registry.register(clientTopic, ws);
    try {
      await handlers.onJoin?.(channelCtx);
    } catch (err) {
      logger.warn("MockWS", `onJoin threw (${channelCtx.connectionId})`, err);
      endSubscriptionAndClose(ws, clientTopic, describeFailure(err, "Subscription failed"));
      return;
    }
    // Confirmed once joined, as a Courier server confirms it — unless the
    // handler already ended it.
    if (!state.ended.signal.aborted && ws.readyState === ws.OPEN) {
      ws.send(encodeMessage({ type: "subscribed", id: msg.id, topic: clientTopic }));
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
      sendError(ws, { code: 4404, message: "Not subscribed" }, msg.topic);
      return;
    }
    try {
      await handlers.onMessage?.(channelCtx, msg.payload);
    } catch (err) {
      logger.warn("MockWS", `onMessage threw (${channelCtx.connectionId})`, err);
      sendError(ws, describeFailure(err, "Handler error"), channelCtx.topic);
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
export async function callOnLeaveOnce(
  state: ConnectionState,
  handlers: ChannelHandlers<unknown, unknown>,
  channelCtx: MessageRouterContext,
  registry: WSConnectionRegistry,
  ws: NodeWebSocket,
): Promise<void> {
  if (!state.subscribed || state.leaveCalled) return;
  state.leaveCalled = true;
  state.ended.abort();
  registry.unregister(channelCtx.topic, ws);
  try {
    await handlers.onLeave?.(channelCtx);
  } catch (err) {
    logger.warn("MockWS", `onLeave threw (${channelCtx.connectionId})`, err);
  }
}
