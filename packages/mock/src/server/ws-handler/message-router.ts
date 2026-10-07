import { logger } from "@noverax/courier";
import {
  decodeMessage,
  describeFailure,
  encodeMessage,
  type WSMessage,
} from "@noverax/courier/internal";
import type { ChannelHandlers, WSChannelContext } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import { sendError, sendSubscriptionEnd } from "./protocol";

/**
 * A channel's context as the router drives it: the context its handlers
 * receive, under the topic the client subscribed to.
 */
export interface MessageRouterContext extends WSChannelContext {
  topic: string;
}

/** One subscription a socket holds: the handlers built for it, and what they are handed. */
export interface MockSubscription {
  readonly topic: string;
  readonly handlers: ChannelHandlers<unknown, unknown>;
  readonly ctx: MessageRouterContext;
  /** Fires when the subscription ends; the handlers see it as `ctx.signal` */
  readonly ended: AbortController;
}

/** A socket as the router reads it: the subscriptions it holds, and how one opens and ends. */
export interface MockSocket {
  readonly ws: NodeWebSocket;
  readonly connectionId: string;
  /** The topic a frame that names none is for: the channel's own */
  readonly defaultTopic: string;
  readonly subscriptions: ReadonlyMap<string, MockSubscription>;
  /**
   * The subscription a subscribe asks for, its handlers built for the
   * variables it carries; none, the client told why, when they could not be
   */
  open(topic: string, id: string | undefined, payload: unknown): MockSubscription | undefined;
  /** End a subscription: its signal fires, `onLeave` runs once, and the socket holds it no more */
  leave(subscription: MockSubscription): Promise<void>;
  /** Settles once no subscription to the topic is still running its `onLeave` */
  settled(topic: string): Promise<void>;
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
 * Dispatch a decoded WS message to the subscription it names.
 *
 * A socket holds a subscription per topic, as a Courier server's does, and
 * an unsubscribe leaves it open: a client keeps one socket for the channels
 * it reaches at an address, and subscribes on it again when a component
 * mounts anew or another set of variables joins.
 * - `subscribe` → open the subscription, fire `onJoin`, confirm with
 *   `subscribed`; one to a topic the socket holds replaces it
 * - `unsubscribe` → fire `onLeave` once, answer `unsubscribed`
 * - `message` → fire the topic's `onMessage`, refused when no subscription has it
 * - `ping` → reply `pong`
 *
 * @param msg - The decoded frame
 * @param socket - The socket it came on
 * @example
 * ```ts
 * ws.on("message", (raw) => void dispatchMessage(decodeMessage(raw.toString()), socket));
 * ```
 */
export async function dispatchMessage(msg: WSMessage, socket: MockSocket): Promise<void> {
  if (msg.type === "subscribe") await subscribe(msg, socket);
  else if (msg.type === "unsubscribe") await unsubscribe(msg, socket);
  else if (msg.type === "message") await deliver(msg, socket);
  else if (msg.type === "ping") send(socket.ws, { type: "pong" });
}

async function subscribe(msg: WSMessage, socket: MockSocket): Promise<void> {
  const topic = msg.topic ?? socket.defaultTopic;
  const held = socket.subscriptions.get(topic);
  if (held) await socket.leave(held);
  /* The subscription before it leaves first: a handler keeping who is in
     a room hears the leave, then the join, as they were asked for. */
  await socket.settled(topic);
  const subscription = socket.open(topic, msg.id, msg.payload);
  if (!subscription) return;
  try {
    await subscription.handlers.onJoin?.(subscription.ctx);
  } catch (err) {
    logger.warn("MockWS", `onJoin threw (${socket.connectionId})`, err);
    sendSubscriptionEnd(socket.ws, topic, msg.id, describeFailure(err, "Subscription failed"));
    await socket.leave(subscription);
    return;
  }
  /* Confirmed once joined, as a Courier server confirms it — unless the
     handler already ended it. */
  if (!subscription.ended.signal.aborted)
    send(socket.ws, { type: "subscribed", id: msg.id, topic });
}

async function unsubscribe(msg: WSMessage, socket: MockSocket): Promise<void> {
  const topic = msg.topic ?? socket.defaultTopic;
  const subscription = socket.subscriptions.get(topic);
  if (subscription) await socket.leave(subscription);
  send(socket.ws, { type: "unsubscribed", id: msg.id, topic });
}

async function deliver(msg: WSMessage, socket: MockSocket): Promise<void> {
  const subscription = socket.subscriptions.get(msg.topic ?? socket.defaultTopic);
  if (!subscription) {
    sendError(socket.ws, { code: 4404, message: "Not subscribed" }, msg.topic);
    return;
  }
  try {
    await subscription.handlers.onMessage?.(subscription.ctx, msg.payload);
  } catch (err) {
    logger.warn("MockWS", `onMessage threw (${socket.connectionId})`, err);
    sendError(socket.ws, describeFailure(err, "Handler error"), subscription.topic);
  }
}

function send(ws: NodeWebSocket, msg: WSMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(encodeMessage(msg));
}
