import { logger } from "@noverax/courier";
import { type ChannelHandlers, describeFailure } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { MockChannelFn, MockHistoryEntry, MockRequestContext } from "../../types";

import { buildChannelContext, refuseOnSubscribe } from "./channel-context";
import type { WSConnectionRegistry } from "./connection-registry";
import {
  type ConnectionState,
  callOnLeaveOnce,
  dispatchMessage,
  parseMessage,
} from "./message-router";
import { generateConnectionId } from "./protocol";
import { parseVariablesFromUrl, type WSRoute } from "./route-resolver";

/** Hooks for emitting WS lifecycle events to Studio (set by the worker Studio runs a mock in) */
export interface WSRequestHooks {
  onConnect?(connectionId: string, group: string, method: string): void;
  onDisconnect?(connectionId: string): void;
}

/** Per-connection activation parameters */
export interface ActivateConnectionParams {
  ws: NodeWebSocket;
  route: WSRoute;
  channelFn: MockChannelFn;
  url: string;
  history: MockHistoryEntry[];
  hooks?: WSRequestHooks;
  registry: WSConnectionRegistry;
  scenarioState: string;
}

/**
 * Activate a single mock WS connection.
 *
 * Runs the channel handler factory, wires `onJoin`/`onMessage`/`onLeave`,
 * tracks subscription state to prevent double-cleanup, registers the
 * connection in the broadcast registry, and ensures all cleanup paths
 * unregister exactly once.
 */
export function activateConnection(params: ActivateConnectionParams): void {
  const { ws, route, channelFn, url, history, hooks, registry, scenarioState } = params;

  const connectionId = generateConnectionId();
  const variables = { ...parseVariablesFromUrl(url), ...route.params };
  const startedAt = performance.now();
  const topic = `${route.group}.${route.method}`;

  const historyEntry: MockHistoryEntry = {
    group: route.group,
    method: route.method,
    variables,
    mocked: true,
    duration: 0,
    timestamp: Date.now(),
    result: { status: 101, data: undefined },
    channel: true,
  };
  history.push(historyEntry);
  hooks?.onConnect?.(connectionId, route.group, route.method);

  // Build user channel handlers — failures here are fatal for the connection
  let handlers: ChannelHandlers<unknown, unknown>;
  try {
    const ctx: MockRequestContext = {
      variables,
      headers: new Headers(),
      callIndex: 0,
      scenarioState,
    };
    handlers = channelFn(ctx);
  } catch (err) {
    logger.warn("MockWS", `channelFn threw (${connectionId})`, err);
    refuseOnSubscribe(ws, topic, describeFailure(err, "Subscription failed"));
    ws.on("close", () => {
      historyEntry.duration = performance.now() - startedAt;
      hooks?.onDisconnect?.(connectionId);
    });
    return;
  }

  const state: ConnectionState = {
    subscribed: false,
    leaveCalled: false,
    ended: new AbortController(),
  };
  const channelCtx = buildChannelContext(ws, topic, variables, connectionId, registry, state);

  ws.on("message", (raw: Buffer | string) => {
    const msg = parseMessage(ws, raw);
    if (!msg) return;
    void dispatchMessage(msg, ws, handlers, channelCtx, state, registry).catch((error: unknown) =>
      logger.warn("MockWS", `Message handling failed (${connectionId})`, error),
    );
  });

  ws.on("close", async () => {
    await callOnLeaveOnce(state, handlers, channelCtx, registry, ws);
    historyEntry.duration = performance.now() - startedAt;
    hooks?.onDisconnect?.(connectionId);
  });

  ws.on("error", (err: Error) => {
    logger.warn("MockWS", `Connection error (${connectionId})`, err);
    // ws will fire "close" after "error" — cleanup happens there
  });
}
