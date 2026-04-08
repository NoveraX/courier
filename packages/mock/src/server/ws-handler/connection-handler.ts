import { logger } from "@noverax/nexus";
import { type ChannelHandlers, encodeMessage } from "@noverax/nexus/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { MockChannelFn, MockHistoryEntry, MockRequestContext } from "../../types";

import type { WSConnectionRegistry } from "./connection-registry";
import {
  type ConnectionState,
  callOnLeaveOnce,
  dispatchMessage,
  parseMessage,
} from "./message-router";
import { errMessage, generateConnectionId, sendErrorAndClose } from "./protocol";
import { parseVariablesFromUrl, type WSRoute } from "./route-resolver";

/** Hooks for emitting WS lifecycle events to studio (set by studio bridge) */
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
  const variables = parseVariablesFromUrl(url);
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
    sendErrorAndClose(ws, 5000, errMessage(err, "channelFn factory threw"), 1011);
    historyEntry.duration = performance.now() - startedAt;
    hooks?.onDisconnect?.(connectionId);
    return;
  }

  const channelCtx = buildChannelContext(ws, topic, variables, connectionId, registry);
  const state: ConnectionState = { subscribed: false, leaveCalled: false };

  ws.on("message", async (raw: Buffer | string) => {
    const msg = parseMessage(ws, raw);
    if (!msg) return;
    await dispatchMessage(msg, ws, handlers, channelCtx, state, registry);
  });

  ws.on("close", async () => {
    await callOnLeaveOnce(state, handlers, channelCtx, registry, ws);
    historyEntry.duration = performance.now() - startedAt;
    hooks?.onDisconnect?.(connectionId);
  });

  ws.on("error", (err: Error) => {
    logger.warn("MockWS", `Connection error (${connectionId}): ${err.message}`);
    // ws will fire "close" after "error" — cleanup happens there
  });
}

function buildChannelContext(
  ws: NodeWebSocket,
  initialTopic: string,
  variables: Record<string, unknown>,
  connectionId: string,
  registry: WSConnectionRegistry,
) {
  // `topic` is mutable: when the client subscribes with a fully qualified
  // topic (`{source}.{group}.{method}#{varsHash}`), the message router
  // rewrites `ctx.topic` so outbound `data` frames echo the client's exact
  // topic. Without this, clients dispatch frames by topic and would
  // silently drop everything sent under the server-local short topic.
  const ctx = {
    topic: initialTopic,
    variables,
    connectionId,
    meta: {} as Record<string, unknown>,
    send(data: unknown) {
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeMessage({ type: "data", topic: ctx.topic, payload: data }));
      }
    },
    broadcast(targetTopic: string, data: unknown) {
      registry.broadcast(targetTopic, data, ws);
    },
    close(code?: number, reason?: string) {
      ws.close(code ?? 1000, reason);
    },
  };
  return ctx;
}
