/**
 * One subscription on a socket of the proxy's WebSocket route: the mocked
 * channel's handlers, run with a context whose frames carry its topic. A
 * socket holds many, so ending one never closes the socket.
 */

import { logger } from "@noverax/courier";
import { describeFailure, type StreamFailure } from "@noverax/courier/internal";
import type { WSChannelContext } from "@noverax/courier/realtime";
import type { MockChannelFn, MockHistoryEntry } from "../../types";
import type { ChannelShape } from "../prefix-route-types";
import { sendEnd, sendFrame } from "./frames";
import type { ChannelSocket, ChannelSubscription } from "./types";

/** What a subscription is opened with */
export interface ChannelRequest {
  group: string;
  method: string;
  /** The topic it is served under */
  topic: string;
  /** Its variables, as their schema produced them */
  variables: unknown;
  channelFn: MockChannelFn;
  shape: ChannelShape | undefined;
}

/**
 * Run a channel's mock for one subscription.
 *
 * @param socket - The socket it is on
 * @param request - The channel and what it is subscribed with
 * @returns The subscription, or why the mock could not make one
 * @example
 * ```ts
 * const opened = openSubscription(socket, request);
 * if ("handlers" in opened) await opened.handlers.onJoin?.(opened.ctx);
 * ```
 */
export function openSubscription(
  socket: ChannelSocket,
  request: ChannelRequest,
): ChannelSubscription | StreamFailure {
  socket.opened += 1;
  const id = `${socket.id}_${socket.opened}`;
  const ended = new AbortController();
  const ctx = channelContext(socket, request.topic, request.variables, id, ended);
  const scenarioState = socket.config.getScenarioState();
  const { group, method, variables, shape } = request;
  try {
    const handlers = request.channelFn({
      variables,
      headers: socket.headers,
      callIndex: 0,
      scenarioState,
    });
    const startedAt = performance.now();
    return {
      id,
      group,
      method,
      shape,
      ctx,
      handlers,
      ended,
      startedAt,
      entry: historyEntry(request),
      left: false,
    };
  } catch (error) {
    logger.warn("MockWS", `The channel mock threw (${id})`, error);
    return describeFailure(error, "Subscription failed");
  }
}

/**
 * End a subscription from the server's side, telling the client why.
 *
 * @param socket - The socket it is on
 * @param topic - Its topic
 * @param failure - Why it ended; absent when it finished
 * @example
 * ```ts
 * await endSubscription(socket, topic, { code: 4000, message: "Room closed" });
 * ```
 */
export async function endSubscription(
  socket: ChannelSocket,
  topic: string,
  failure?: StreamFailure,
): Promise<void> {
  const subscription = socket.subscriptions.get(topic);
  if (!subscription || subscription.left) return;
  sendEnd(socket.ws, topic, undefined, failure);
  await leaveSubscription(socket, topic, subscription, failure);
}

/**
 * Take a subscription off its socket, once whichever way it ends: `onLeave`
 * runs, its broadcasts stop reaching it, and the hooks hear how it went.
 *
 * @param socket - The socket it is on
 * @param topic - Its topic
 * @param subscription - The subscription
 * @param failure - Why it failed, if it did
 * @example
 * ```ts
 * await leaveSubscription(socket, topic, subscription);
 * ```
 */
export async function leaveSubscription(
  socket: ChannelSocket,
  topic: string,
  subscription: ChannelSubscription,
  failure?: StreamFailure,
): Promise<void> {
  if (subscription.left) return;
  subscription.left = true;
  subscription.ended.abort();
  if (socket.subscriptions.get(topic) === subscription) socket.subscriptions.delete(topic);
  socket.config.connections.unregister(topic, socket.ws);
  report(socket, subscription, failure);
  /* The next subscription to the topic waits for this onLeave: a handler
     keeping who is in a room hears the leave, then the join, as they came. */
  const left = runOnLeave(subscription);
  socket.leaving.set(topic, left);
  await left;
  if (socket.leaving.get(topic) === left) socket.leaving.delete(topic);
}

async function runOnLeave(subscription: ChannelSubscription): Promise<void> {
  try {
    await subscription.handlers.onLeave?.(subscription.ctx);
  } catch (error) {
    logger.warn("MockWS", `onLeave threw (${subscription.id})`, error);
  }
}

function report(
  socket: ChannelSocket,
  subscription: ChannelSubscription,
  failure?: StreamFailure,
): void {
  const duration = performance.now() - subscription.startedAt;
  subscription.entry.duration = duration;
  const { hooks } = socket.config;
  if (failure) hooks?.onError?.(subscription.id, failure.code, failure.message, duration);
  else
    hooks?.onEnd?.(subscription.id, 101, undefined, duration, 0, socket.config.getScenarioState());
}

function historyEntry({ group, method, variables }: ChannelRequest): MockHistoryEntry {
  const result = { status: 101, data: undefined };
  return {
    group,
    method,
    variables,
    mocked: true,
    duration: 0,
    timestamp: Date.now(),
    result,
    channel: true,
  };
}

function channelContext(
  socket: ChannelSocket,
  topic: string,
  variables: unknown,
  connectionId: string,
  ended: AbortController,
): WSChannelContext {
  return {
    topic,
    variables,
    connectionId,
    meta: {},
    signal: ended.signal,
    send(data) {
      if (!ended.signal.aborted) sendFrame(socket.ws, { type: "data", topic, payload: data });
    },
    broadcast(target, data) {
      socket.config.connections.broadcast(target, data, socket.ws);
    },
    close(code, reason) {
      const failed = code !== undefined && code !== 1000;
      void endSubscription(
        socket,
        topic,
        failed ? { code, message: reason ?? "Channel closed" } : undefined,
      );
    },
  };
}
