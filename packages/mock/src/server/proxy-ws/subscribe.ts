/**
 * A `subscribe` on the proxy's WebSocket route, answered as a Courier server
 * answers it: the variables checked against the channel's schema, the topic
 * keyed as its `.topic()` reader says — `renamed` first when that is not the
 * topic asked for — `subscribed` once `onJoin` has run, and `complete` with
 * the reason when the subscription cannot go on.
 */

import { describeFailure, type StreamFailure, type WSMessage } from "@noverax/courier/realtime";
import type { MockChannelFn } from "../../types";
import type { ChannelShape } from "../prefix-route-types";
import { checkAgainst } from "./check-schema";
import { findMappedEndpoint } from "./find-endpoint";
import { sendEnd, sendFrame } from "./frames";
import { parseProxyTopic, servedTopic } from "./proxy-topic";
import { type ChannelRequest, leaveSubscription, openSubscription } from "./subscription";
import type { ProxySocket } from "./types";

/** The path a Courier proxy's WebSocket route is served at, which the mock stands in for */
export const PROXY_WS_PATH = "/api/ws";

interface ResolvedChannel {
  group: string;
  method: string;
  base: string;
  channelFn: MockChannelFn;
  shape: ChannelShape | undefined;
}

/**
 * Open the subscription a `subscribe` asks for. A message sent on its topic
 * while it opens waits for it.
 *
 * @param socket - The socket it arrived on
 * @param message - The `subscribe`
 * @example
 * ```ts
 * await handleSubscribe(socket, { type: "subscribe", id: "1", topic: "shop.chat.room", payload: { room: "r1" } });
 * ```
 */
export async function handleSubscribe(socket: ProxySocket, message: WSMessage): Promise<void> {
  const topic = message.topic;
  if (!topic) {
    const id = message.id !== undefined ? { id: message.id } : {};
    sendFrame(socket.ws, { type: "error", ...id, error: { code: 4400, message: "Missing topic" } });
    return;
  }
  const opening = subscribe(socket, message, topic);
  socket.opening.set(topic, opening);
  try {
    await opening;
  } finally {
    if (socket.opening.get(topic) === opening) socket.opening.delete(topic);
  }
}

async function subscribe(socket: ProxySocket, message: WSMessage, topic: string): Promise<void> {
  const channel = resolveChannel(socket, topic);
  if (!("channelFn" in channel)) return sendEnd(socket.ws, topic, message.id, channel);
  const checked = await checkAgainst(channel.shape?.variables, message.payload);
  if ("issues" in checked) {
    const failure = { code: 4422, message: "Invalid variables", issues: checked.issues };
    return sendEnd(socket.ws, topic, message.id, failure);
  }
  const served = keyedTopic(channel, checked.value);
  if (typeof served !== "string") return sendEnd(socket.ws, topic, message.id, served);
  if (socket.ws.readyState !== socket.ws.OPEN) return;
  await join(socket, message, topic, { ...channel, topic: served, variables: checked.value });
}

function resolveChannel(socket: ProxySocket, topic: string): ResolvedChannel | StreamFailure {
  const route = parseProxyTopic(topic);
  if (!route) return { code: 4400, message: "Topic must include source name" };
  const state = socket.config.getScenarioState();
  const handler = socket.config.registry.get(route.group, route.method, state);
  if (handler?.transport !== "ws" || !handler.channelFn) {
    const name = route.group ? `${route.group}.${route.method}` : route.method;
    return { code: 4404, message: `No channel mock for "${name}" in state "${state}"` };
  }
  const shape = findMappedEndpoint(socket.config.mappings, route.group, route.method)?.channel;
  return { ...route, channelFn: handler.channelFn, shape };
}

function keyedTopic(channel: ResolvedChannel, variables: unknown): string | StreamFailure {
  try {
    return servedTopic(channel.base, variables, channel.shape?.topicKey);
  } catch (error) {
    return describeFailure(error, "Subscription failed");
  }
}

async function join(
  socket: ProxySocket,
  message: WSMessage,
  asked: string,
  request: ChannelRequest,
): Promise<void> {
  const { ws, config } = socket;
  const previous = socket.subscriptions.get(request.topic);
  if (previous) await leaveSubscription(socket, request.topic, previous);
  const id = message.id !== undefined ? { id: message.id } : {};
  if (request.topic !== asked)
    sendFrame(ws, { type: "renamed", ...id, topic: asked, payload: request.topic });
  const opened = openSubscription(socket, request);
  if (!("handlers" in opened)) return sendEnd(ws, request.topic, message.id, opened);
  socket.subscriptions.set(request.topic, opened);
  config.connections.register(request.topic, ws);
  config.history.push(opened.entry);
  const headers = Object.fromEntries(socket.headers);
  config.hooks?.onStart?.(
    opened.id,
    "GET",
    PROXY_WS_PATH,
    request.group,
    request.method,
    request.variables,
    headers,
  );
  try {
    await opened.handlers.onJoin?.(opened.ctx);
  } catch (error) {
    const failure = describeFailure(error, "Subscription failed");
    sendEnd(ws, request.topic, message.id, failure);
    return leaveSubscription(socket, request.topic, opened, failure);
  }
  if (!opened.left) sendFrame(ws, { type: "subscribed", ...id, topic: request.topic });
}
