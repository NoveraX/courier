import { logger } from "@noverax/courier";
import { describeFailure } from "@noverax/courier/internal";
import type { ChannelHandlers } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { MockChannelFn, MockHistoryEntry, MockRequestContext } from "../../types";
import type { RequestHooks } from "../route-types";
import { buildChannelContext, refuseOnSubscribe } from "./channel-context";
import type { WSConnectionRegistry } from "./connection-registry";
import {
  type ConnectionState,
  callOnLeaveOnce,
  dispatchMessage,
  parseMessage,
} from "./message-router";
import { generateConnectionId } from "./protocol";
import { parseVariablesFromUrl, requestPath, type WSRoute } from "./route-resolver";

/** Per-connection activation parameters */
export interface ActivateConnectionParams {
  ws: NodeWebSocket;
  route: WSRoute;
  channelFn: MockChannelFn;
  url: string;
  history: MockHistoryEntry[];
  /** Told of the channel as it opens and ends — Studio's mock logs */
  hooks?: RequestHooks;
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
  const path = requestPath(url) ?? url;
  hooks?.onStart?.(connectionId, "GET", path, route.group, route.method, variables);
  const ended = (): number => {
    historyEntry.duration = performance.now() - startedAt;
    return historyEntry.duration;
  };

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
    const failure = describeFailure(err, "Subscription failed");
    refuseOnSubscribe(ws, topic, failure);
    ws.on("close", () => {
      const duration = ended();
      hooks?.onError?.(connectionId, failure.code, failure.message, duration);
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
    const duration = ended();
    hooks?.onEnd?.(connectionId, 101, undefined, duration, 0, scenarioState);
  });

  ws.on("error", (err: Error) => {
    logger.warn("MockWS", `Connection error (${connectionId})`, err);
    // ws will fire "close" after "error" — cleanup happens there
  });
}
