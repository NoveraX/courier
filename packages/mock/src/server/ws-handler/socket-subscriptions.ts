import { logger } from "@noverax/courier";
import { describeFailure, type StreamFailure } from "@noverax/courier/internal";
import type { ChannelHandlers } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { MockChannelFn, MockRequestContext } from "../../types";
import { buildChannelContext } from "./channel-context";
import type { WSConnectionRegistry } from "./connection-registry";
import type { MockSocket, MockSubscription } from "./message-router";
import { sendSubscriptionEnd } from "./protocol";

/** What a socket's subscriptions are opened with. */
export interface SocketInput {
  readonly ws: NodeWebSocket;
  readonly connectionId: string;
  /** The topic a frame that names none is for: the channel's own */
  readonly defaultTopic: string;
  readonly channelFn: MockChannelFn;
  readonly registry: WSConnectionRegistry;
  readonly scenarioState: string;
  /** The variables the socket's address carries: its path parameters and its query */
  readonly variables: Record<string, unknown>;
  /** Told when a channel's handlers could not be built */
  readonly failed: (failure: StreamFailure) => void;
}

/**
 * The subscriptions of one mock socket. Each is built as a Courier server
 * builds one: the channel's handlers made anew for the variables its
 * subscribe carries over the address's, in the broadcast registry under its
 * topic while it lasts, and its `onLeave` run once however it ends.
 *
 * @param input - The socket, the channel, and what its subscriptions are made with
 * @returns The socket as the router drives it
 * @example
 * ```ts
 * const socket = socketSubscriptions({ ws, connectionId, defaultTopic, channelFn, registry, scenarioState, variables, failed });
 * ```
 */
export function socketSubscriptions(input: SocketInput): MockSocket {
  const { ws, connectionId, registry } = input;
  const subscriptions = new Map<string, MockSubscription>();
  /* The `onLeave` still running for each topic: the next subscription to it waits for it. */
  const leaving = new Map<string, Promise<void>>();
  const socket: MockSocket = {
    ws,
    connectionId,
    defaultTopic: input.defaultTopic,
    subscriptions,
    settled: (topic) => leaving.get(topic) ?? Promise.resolve(),
    open(topic, id, payload) {
      const variables = { ...input.variables, ...variablesOf(payload) };
      const handlers = handlersFor(input, variables);
      if ("failure" in handlers) {
        sendSubscriptionEnd(ws, topic, id, handlers.failure);
        return undefined;
      }
      const ended = new AbortController();
      const end = (): void => void socket.leave(subscription);
      const ctx = buildChannelContext({
        ws,
        topic,
        variables,
        connectionId,
        registry,
        signal: ended.signal,
        end,
      });
      const subscription: MockSubscription = { topic, handlers: handlers.built, ctx, ended };
      subscriptions.set(topic, subscription);
      registry.register(topic, ws);
      return subscription;
    },
    leave(subscription) {
      const { topic } = subscription;
      if (subscription.ended.signal.aborted) return socket.settled(topic);
      subscription.ended.abort();
      if (subscriptions.get(topic) === subscription) {
        subscriptions.delete(topic);
        registry.unregister(topic, ws);
      }
      const left = runOnLeave(subscription, connectionId);
      leaving.set(topic, left);
      void left.then(() => {
        if (leaving.get(topic) === left) leaving.delete(topic);
      });
      return left;
    },
  };
  return socket;
}

async function runOnLeave(subscription: MockSubscription, connectionId: string): Promise<void> {
  try {
    await subscription.handlers.onLeave?.(subscription.ctx);
  } catch (err) {
    logger.warn("MockWS", `onLeave threw (${connectionId})`, err);
  }
}

/* The channel's handlers for one subscription, or why they could not be built. */
function handlersFor(
  input: SocketInput,
  variables: Record<string, unknown>,
): { built: ChannelHandlers<unknown, unknown> } | { failure: StreamFailure } {
  const context: MockRequestContext = {
    variables,
    headers: new Headers(),
    callIndex: 0,
    scenarioState: input.scenarioState,
  };
  try {
    return { built: input.channelFn(context) };
  } catch (err) {
    logger.warn("MockWS", `channelFn threw (${input.connectionId})`, err);
    const failure = describeFailure(err, "Subscription failed");
    input.failed(failure);
    return { failure };
  }
}

/* A subscribe's payload is its variables, as a Courier server reads them; anything else carries none. */
function variablesOf(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return {};
  return { ...(payload as Record<string, unknown>) };
}
